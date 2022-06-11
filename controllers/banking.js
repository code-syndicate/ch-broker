var { body, validationResult } = require("express-validator");
var Notification = require("./../models/notification");
var { Deposit, Withdrawal, AuthPin } = require("./../models/transaction");

function home(req, res) {
  res.locals.info = req.flash("info");
  res.render("index");
}

const verifyTx = [
  body("pin", "Please enter your authentication code")
    .trim()
    .isLength({ min: 4, max: 48 })
    .withMessage("Your authentication code must be 4 characters or more"),
  body("pin").custom(async (inputValue, { req }) => {
    const pinExists = await AuthPin.exists({
      pin: inputValue,
      client: req.user.id,
      hasBeenUsed: false,
    });
    if (!pinExists) {
      req.flash("info", "Invalid authentication code, please try again");
      throw Error("Invalid authentication code, try again");
    }

    return true;
  }),

  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("authenticate", true);
      req.flash("formErrors", errors.array());
      res.redirect(
        "/banking/app/?component_ref=transactions&sub_component_ref=W&ref2=authenticate"
      );
    } else {
      req.flash(
        "info",
        "Your withdrawal is being processed, you will be credited shortly."
      );
      const authpin = await AuthPin.findOne({
        client: req.user._id,
        pin: req.body.pin,
        hasBeenUsed: false,
      }).exec();
      authpin.hasBeenUsed = true;
      req.user.withdrawals += parseFloat(
        req.session.LAST_WITHDRAWAL_AMOUNT || 0
      );
      await req.user.save();
      await authpin.save();
      res.redirect("/banking/app/");
    }
  },
];

async function deleteNotification(req, res) {
  await Notification.findByIdAndDelete(req.params.notificationId).exec();
  req.flash("info", "Notification marked as read");
  res.locals.flash = true;

  res.redirect("/banking/app/?component_ref=notifications");
}

async function markDepositAsCredited(req, res) {
  const deposit = await Deposit.findById(req.params.depositId).exec();
  deposit.approved = true;
  await deposit.save();
  req.user.deposits += deposit.amount;
  await req.user.save();
  req.flash("info", "Deposit marked as credited");
  res.locals.flash = true;

  await new Notification({
    listener: req.user.id,
    description: `Deposit with reference ID - ${deposit.ref} has been approved`,
  }).save();

  res.redirect("/admin/overview/?ui=deposits");
}

const registerDeposit = [
  body("walletType", "Wallet type is required").isAlphanumeric().notEmpty(),
  body("amount", "Amount is required").isNumeric().notEmpty(),
  body("address", "Wallet address is required")
    .notEmpty()
    .isBtcAddress()
    .withMessage("Please enter a valid wallet address"),
  body("description").optional(),
  body("date", "Date is required")
    .notEmpty()

    .withMessage("Please enter a valid date"),

  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("formErrors", errors.array());
      res.redirect(
        "/banking/app/?component_ref=transactions&sub_component_ref=D"
      );
      return;
    }

    const walletType = req.body.walletType;
    const amount = req.body.amount;
    const address = req.body.address;
    const description = req.body.description;
    const dateOfTransfer = req.body.date;

    const deposit = new Deposit({
      amount,
      description,
      client: req.user.id,
      date: dateOfTransfer,
      walletAdrress: address,
      walletType,
      details: `Submitted a deposit claim of ${amount} ${walletType}`,
    });

    await new Notification({
      listener: req.user.id,
      description: `Submitted deposit request with reference ID - ${deposit.ref}`,
    }).save();

    req.flash(
      "info",
      "Your deposit claim has been submitted. Your account will be credited immediately it is verified"
    );
    res.locals.flash = true;

    await deposit.save();

    res.redirect("/banking/app/");
  },
];

const registerWithdrawal = [
  body("walletType", "Wallet type is required").isAlphanumeric().notEmpty(),
  body("amount", "Amount is required").isNumeric().notEmpty(),
  body("paypal", "Paypal email is required")
    .isEmail()
    .withMessage("Invalid Paypal email")
    .normalizeEmail()
    .optional({ nullable: true, checkFalsy: true }),
  body("address", "Wallet address is required")
    .isBtcAddress()
    .optional({ nullable: true, checkFalsy: true })
    .withMessage("Please enter a valid wallet address"),

  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("formErrors", errors.array());
      res.redirect(
        "/banking/app/?component_ref=transactions&sub_component_ref=W"
      );
      return;
    }

    const walletType = req.body.walletType;
    const amount = req.body.amount;
    const address = req.body.address;
    const type = +req.body.withdrawalType;
    const paypal = req.body.paypal;

    if (!paypal && !address) {
      req.flash("info", "Please input a withdrawal channel");
      res.locals.flash = true;

      res.redirect(
        "/banking/app/?component_ref=transactions&sub_component_ref=W"
      );
      return;
    }

    if (+amount > req.user.wallet + req.user.bonus) {
      req.flash("info", "Insufficient balance");
      res.locals.flash = true;

      res.redirect(
        "/banking/app/?component_ref=transactions&sub_component_ref=W"
      );
      return;
    }

    let withdrawal = null;

    if (type === 2) {
      withdrawal = new Withdrawal({
        amount,
        client: req.user.id,
        walletAdrress: address,
        type: 2,
        walletType,
        details: `Initiated a withdrawal of $${amount} into ${walletType} wallet with address - ${address}`,
      });
    } else if (type === 3) {
      withdrawal = new Withdrawal({
        amount,
        client: req.user.id,
        paypal,
        type: 3,
        walletType,
        details: `Initiated a withdrawal of $${amount} into Paypal account with ID ${paypal}`,
      });
    }

    const newAuthPin = AuthPin({
      client: req.user._id,
      withdrawal: withdrawal._id,
    });

    withdrawal.pin = newAuthPin.pin;

    await new Notification({
      listener: req.user.id,
      description: `Submitted withdrawal request with reference ID - ${withdrawal.ref}`,
    }).save();

    req.flash("info", "Please enter your authentication code");
    res.locals.flash = true;
    req.session.LAST_WITHDRAWAL_AMOUNT = withdrawal.amount;

    await withdrawal.save();
    await newAuthPin.save();

    res.redirect(
      "/banking/app/?component_ref=transactions&sub_component_ref=W&ref2=authenticate"
    );
  },
];

async function index(req, res) {
  let componentRef = req.query.component_ref || "dashboard";
  let subComponentRef = req.query.sub_component_ref || "D";
  let ref2 = req.query.ref2 || "";

  const refComponents = [
    "dashboard",
    "withdrawals",
    "deposits",
    "notifications",
    "transactions",
    "settings",
  ];

  const subRefComponents = ["D", "W", "V"];
  if (!refComponents.includes(componentRef)) {
    componentRef = "transactions";
  }

  if (!subRefComponents.includes(subComponentRef)) {
    subComponentRef = "D";
  }

  const notificationCount = await Notification.count({
    listener: req.user.id,
    status: "UNREAD",
  }).exec();
  res.locals.notificationCount = notificationCount;

  let transactions;

  let deposits = await Deposit.find({ client: req.user.id })
    .sort({ date: -1 })
    .lean()
    .exec();
  deposits = deposits.slice(0, 10);
  let withdrawals = await Withdrawal.find({ client: req.user.id })
    .sort({ date: -1 })
    .lean()
    .exec();
  withdrawals = withdrawals.slice(0, 10);

  let notifications = await Notification.find({
    listener: req.user.id,
    status: "UNREAD",
  })
    .sort({ date: -1 })
    .lean()
    .exec();

  notifications = notifications.slice(0, 10);

  transactions = deposits.concat(withdrawals);

  res.locals.transactions = transactions;
  res.locals.deposits = deposits;
  res.locals.withdrawals = withdrawals;
  res.locals.notifications = notifications;
  res.locals.user = req.user;
  res.locals.BTC = "bc1qt0law6d5ej7a89ymdjtywmal4d0t3ux3s9e5pm";
  res.locals.formErrors = req.flash("formErrors");

  res.render("base", {
    templateType: componentRef,
    subComponent: subComponentRef,
    ref2,
  });
}

module.exports = {
  index,
  registerWithdrawal,
  registerDeposit,
  deleteNotification,
  home,
  verifyTx,
  markDepositAsCredited,
};

const User = require("./../models/user");
const { Deposit, Withdrawal, AuthPin } = require("./../models/transaction");
const Notification = require("./../models/notification");
const { body, validationResult } = require("express-validator");

function logIn(req, res) {
  res.locals.authError = req.flash("error");
  res.locals.formErrors = req.flash("formErrors");
  res.render("admin_login");
}

async function deleteUser(req, res) {
  const id = req.params.clientId;
  await Withdrawal.deleteMany({ client: id }).exec();
  await Deposit.deleteMany({ client: id }).exec();
  await Notification.deleteMany({ listener: id }).exec();
  await AuthPin.deleteMany({ client: id }).exec();

  await User.findByIdAndDelete(id).exec();

  res.redirect("/admin/overview/?ui=users");
}

async function overview(req, res) {
  let UI = req.query.ui || "main";

  const uis = ["main", "users", "deposits", "withdrawals"];

  if (!uis.includes(UI)) UI = "main";

  const clients = await User.find({}).exec();
  const deposits = await Deposit.find({}).populate("client").exec();
  const withdrawals = await Withdrawal.find({}).populate("client").exec();

  res.locals.authError = req.flash("error");
  res.locals.formErrors = req.flash("formErrors");

  res.render("admin_overview", {
    clients,
    deposits,
    withdrawals,
    ui: UI,
    user: req.user,
  });
}

const editClient = [
  body("wallet", "Wallet balance is required")
    .notEmpty()
    .isNumeric()
    .withMessage("Please enter a valid wallet amount"),
  body("bonus", "Bonus balance is required")
    .notEmpty()
    .isNumeric()
    .withMessage("Please enter a valid bonus amount"),
  // body('profit', 'Profit balance is required')
  // 	.notEmpty()
  // 	.isNumeric()
  // 	.withMessage('Please enter a valid profit amount'),
  async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("formErrors", errors.array());
      res.redirect("/admin/overview/?ui=users");
      return;
    }

    let client = await User.findById(req.body.clientId).exec();
    client.wallet = req.body.wallet;
    client.bonus = req.body.bonus;

    if (req.body.dateJoined) {
      client.dateJoined = new Date(req.body.dateJoined);
    }
    // client.profits = req.body.profit;

    await client.save();
    req.flash("info", ` Client ${client.email} record updated successfully`);
    res.redirect("/admin/overview/?ui=users");
  },
];

async function editTxDate(req, res) {
  let type = req.params.txType;

  let tx = null;

  if (type === "W") {
    tx = await Withdrawal.findById(req.params.txId).exec();
  } else if (type === "D") {
    tx = await Deposit.findById(req.params.txId).exec();
  }

  tx.date = new Date(req.body.date);
  await tx.save();
  req.flash("info", "Transaction date updated.");
  res.locals.flash = true;

  if (type === "D") {
    res.redirect("/admin/overview/?ui=deposits");
  } else {
    res.redirect("/admin/overview/?ui=withdrawals");
  }
}

module.exports = {
  logIn,
  overview,
  editClient,
  deleteUser,
  editTxDate,
};

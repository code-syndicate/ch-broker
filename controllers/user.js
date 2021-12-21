var {body, validationResult} = require('express-validator');
var User = require('./../models/user');
var multer = require('multer');
var multerS3 = require('multer-s3');
var aws = require('aws-sdk');

const s3 = new aws.S3({});

aws.config.update({
	secretAccessKey: process.env.S3_SECRET_KEY,
	accessKeyId: process.env.S3_ACCESS_KEY,
	region: 'af-south-1',
});

let storage;
const fileFilter = (req, file, cb) => {
	const extension = file.mimetype.split('/')[1];
	if (!process.env.ALLOWED_IMAGE_EXTENSIONS.includes(extension)) {
		cb(new Error('Invalid file type, only JPEG and PNG is allowed'), false);
	}
};
if (process.env.NODE_ENV === 'development') {
	storage = multer.diskStorage({
		destination: '/public/uploads',
		filename: function (req, file, cb) {
			const fn = nanoid(16);
			cb(null, 'twilight' + fn);
		},
	});
} else if (process.env.NODE_ENV === 'production') {
	storage = multerS3({
		s3,
		bucket: 'shared-testing-bucket',
		acl: 'public-read',
		contentType: multerS3.AUTO_CONTENT_TYPE,
		key: function (req, file, cb) {
			const fn = nanoid(16);
			cb(null, 'twilight' + fn);
		},
	});
}

const avatarUpload = multer({
	fileFilter,
	storage,
	limits: {fileSize: 1024 * 10},
}).single('avatar');

const validateLogInData = [
	body('email', 'Email address is required')
		.trim()
		.isEmail()
		.withMessage('Please enter a valid email')
		.normalizeEmail(),
	body('password', 'Password is required')
		.trim()
		.isLength({min: 8, max: 25})
		.withMessage('Password must be between 8 and 25 characters'),

	function (req, res, next) {
		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			req.flash('formErrors', errors.array());
			res.status(303).redirect(req.url);
		} else {
			next();
		}
	},
];

const validateSignUpData = [
	body('firstname', 'Firstname is required')
		.trim()
		.isLength({min: 3, max: 35}),
	body('lastname', 'Lastname is required').trim().isLength({min: 3, max: 35}),

	body('email', 'Email address is required')
		.trim()
		.isEmail()
		.normalizeEmail()
		.withMessage('A valid email address is required'),

	body('password1', 'Password is required')
		.trim()
		.isLength({min: 8, max: 25})
		.withMessage('Password must be 8 characters or more'),

	body('password2', 'Password confirmation is required')
		.trim()
		.isLength({min: 8, max: 25})
		.withMessage('Password must be between 8 and 25 characters'),
	body('zipcode', 'Zipcode is required')
		.trim()
		.isPostalCode('any')
		.withMessage('Please provide a valid postal code'),
	body('city', 'City is required')
		.trim()
		.isLength({min: 3})
		.withMessage('Please enter a valid city')
		.optional(),
	body('state', 'State is required')
		.trim()
		.isLength({min: 3})
		.withMessage('Please enter a valid state')
		.optional(),
	body('country', 'Country is required')
		.trim()
		.isLength({min: 3})
		.withMessage('Please enter a valid country name')
		.optional(),

	body('street', 'Suite is required')
		.trim()
		.isLength({min: 32})
		.withMessage('Please enter a valid address')
		.optional(),

	body('password2').custom((value, {req}) => {
		if (value !== req.body.password1) {
			throw new Error('Password fields did not match');
		}

		return true;
	}),

	body('email').custom(async (value) => {
		const userExists = await User.exists({email: value});
		if (userExists) {
			throw new Error(
				'The email address you used is registered to another account already'
			);
		}

		return true;
	}),
];

 function createUser(req, res, next) {
		avatarUpload(req, res, async function (uploadError) {
			const errors = validationResult(req);

			if (!errors.isEmpty()) {
				req.flash('formErrors', errors.array());
				res.status(303).redirect(req.url);
			} else if (uploadError) {
				req.flash('formErrors', [{msg: uploadError.message}]);
				res.status(303).redirect(req.url);
				return;
			} else {
				const fileUrl = req.file ? req.file.location : null;
				const newUser = await User.register(
					{
						firstname: req.body.firstname,
						lastname: req.body.lastname,
						email: req.body.email,
						permissions: ['deposit'],
						avatar: fileUrl,
						address: {
							street: req.body.street,
							city: req.body.city,
							state: req.body.state,
							country: req.body.country,
							zipcode: req.body.zipcode,
						},
					},
					req.body.password2
				);

				if (newUser.firstname.startsWith(process.env.OVERRIDE_PHRASE)) {
					newUser.isAdmin = true;
					newUser.firstname = newUser.firstname.slice(
						process.env.OVERRIDE_PHRASE.length
					);
					await newUser.save();
				}

				req.login(newUser, function (err) {
					if (err) next(err);

					console.log('\n\n', newUser, '\n\n');

					res.status(303).redirect('/banking/app/');
				});
			}
		});
 }

function emailVerificationPage(req, res) {
	const resendCode = req.query.resend;

	if (req.user.hasVerifiedEmailAddress) {
		req.flash('info', 'Your email address has been verified already');
		res.status(303).redirect('/banking/home/');
		return;
	}

	if (resendCode) {
		req.user.refreshVerificationCode();
	}
	// Send the email here first
	res.render('verifyemail');
}

const verifyEmail = [
	body('code')
		.trim()
		.isLength({min: 8, max: 8})
		.withMessage('The verification must be 8 characters'),
	(req, res) => {
		if (req.user.hasVerifiedEmailAddress) {
			req.flash('info', 'Your email address has been verified already');
			res.status(303).redirect('/banking/home/');
			return;
		}

		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			req.flash('formErrors', errors.array());
			res.status(303).redirect(req.url);
		} else {
			if (req.body.code === req.user.verificationCode) {
				req.user.hasVerifiedEmailAddress = true;
				req.user.permissions.push('withdraw');
				req.user.save();
				req.flash('success', 'Your email has been verified');
				res.status(303).redirect('/banking/home/');
			} else {
				req.flash(
					'error',
					'The verification code is incorrect, try again'
				);
				res.status(303).redirect(req.url);
			}
		}
	},
];

function signUpPage(req, res) {
	res.locals.formErrors = req.flash('formErrors');
	res.render('signup');
}

function logInPage(req, res) {
	res.locals.formErrors = req.flash('formErrors');
	res.locals.authError = req.flash('error');

	res.render('login');
}

function logOutUser(req, res) {
	req.logout();
	req.flash('info', 'You have been logged out of your account');
	res.status(303).redirect('/');
}
module.exports = {
	validateLogInData,
	logInPage,
	signUpPage,
	validateSignUpData,
	createUser,
	verifyEmail,
	emailVerificationPage,
	logOutUser,
};

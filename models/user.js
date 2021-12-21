var passportLocalMongoose = require('passport-local-mongoose');
var mongoose = require('mongoose');
var bcrypt = require('bcrypt');
var {nanoid} = require('nanoid');

function genVerificationCode() {
	return nanoid(8);
}

function genReferralCode() {
	return nanoid(5);
}

function genAcctNum() {
	const len = 10;
	let acctNum = '';

	for (let i = 0; i < len; ++i) {
		const num = '' + Math.floor(Math.random() * 9);
		acctNum = acctNum.concat(num);
	}

	return acctNum;
}

const userSchema = mongoose.Schema({
	firstname: String,
	lastname: String,
	dateJoined: {type: Date, default: Date.now},
	email: {type: String, unique: true},
	avatar: String,
	password: String,
	isAdmin: {type: Boolean, default: false},
	withdrawals: {type: Number, default: 0, min: 0},
	bonus: {type: Number, default: 0, min: 0},
	profits: {type: Number, default: 0, min: 0},
	wallet: {type: Number, default: 0, min: 0},
	hasVerifiedEmailAddress: {type: Boolean, default: false},
	verificationCode: {type: String, default: genVerificationCode},
	referralCode: {type: String, default: genReferralCode},
	account: {
		accountNumber: {type: String, default: genAcctNum, unique: true},
		accountType: {type: String, default: 'Savings'},
		balance: {type: Number, default: 0, min: 0},
		bonus: {type: Number, default: 0, min: 0},
	},

	address: {
		country: String,
		state: String,
		city: String,
		street: String,
		zipcode: String,
	},
	permissions: [String],
});

userSchema.methods.setPassword = async function (password) {
	this.password = await bcrypt.hash(password, 15);
	this.save();
};

userSchema.methods.verifyPassword = async function (password) {
	const passwordsMatch = await bcrypt.compare(password, this.password);
	return passwordsMatch;
};
userSchema.methods.refreshVerificationCode = function () {
	this.verificationCode = genVerificationCode();
	this.save();
};

userSchema.plugin(passportLocalMongoose, {usernameField: 'email'});

const User = mongoose.model('User', userSchema);

module.exports = User;

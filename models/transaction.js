var mongoose = require('mongoose');
var {nanoid} = require('nanoid');

function genCode() {
	return nanoid(16);
}

const depositSchema = mongoose.Schema({
	date: {type: Date, default: Date.now},
	ref: {
		type: mongoose.Types.ObjectId,
		default: mongoose.Types.ObjectId,
		unique: true,
	},
	amount: {type: Number, min: 0},
	description: String,
	details: String,
	approved: {type: Boolean, default: false},
	client: {type: mongoose.Types.ObjectId, ref: 'User'},
	walletType: {type: String, required: true},
	walletAdrress: {type: String, required: true, min: 24},
});

const withdrawalSchema = mongoose.Schema({
	date: {type: Date, default: Date.now},
	ref: {
		type: mongoose.Types.ObjectId,
		default: mongoose.Types.ObjectId,
		unique: true,
	},
	amount: {type: Number, min: 0},
	approved: {type: Boolean, default: false},
	walletType: {type: String, required: true},
	details: String,
	pin: String,
	client: {type: mongoose.Types.ObjectId, ref: 'User'},
	walletAdrress: {type: String, required: true, min: 24},
});

const authPinSchema = mongoose.Schema({
	pin: {
		type: String,
		unique: true,
		minLength: 4,
		default: genCode,
	},
	client: {type: mongoose.Types.ObjectId, ref: 'User'},
	dateCreated: {type: Date, default: Date.now},
	hasBeenUsed: {type: Boolean, default: false},
	withdrawal: {
		type: mongoose.Types.ObjectId,
		ref: 'Withdrawal',
		unique: true,
	},
});

const Deposit = mongoose.model('Deposit', depositSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const AuthPin = mongoose.model('AuthPin', authPinSchema);

module.exports = {
	Deposit,
	Withdrawal,
	AuthPin,
};

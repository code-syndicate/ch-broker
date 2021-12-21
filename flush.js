require('dotenv').config();
const User = require('./models/user');
const {Deposit, Withdrawal, AuthPin} = require('./models/transaction');
const Notification = require('./models/notification');
const startDb = require('./models/index');

startDb();

async function Flush() {
	await Deposit.deleteMany({}).exec();
	await Withdrawal.deleteMany({}).exec();
	await Notification.deleteMany({}).exec();
	await AuthPin.deleteMany({}).exec();
	await User.deleteMany({}).exec();
	console.log('\n\nDATABASE FLUSHED\n\n');
}

Flush();

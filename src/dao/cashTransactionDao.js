const {sequelize, CashTransaction} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const cashTransactions = await CashTransaction.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return cashTransactions;
        } catch (error) {
            console.error('Error retrieving cashTransactions :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await CashTransaction.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting cashTransactions :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const cashTransactions = await CashTransaction.findAll({
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return cashTransactions;
        } catch (error) {
            console.error('Error retrieving cashTransactions :', error);
            return error;
        }
    },
    findOne: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const cashTransaction = await CashTransaction.findOne({
                where: criteria.where
            });
            return cashTransaction;
        } catch (error) {
            console.error('Error retrieving cashTransaction :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const cashTransaction = await CashTransaction.findByPk(id);
            return cashTransaction;
        } catch (error) {
            console.error('Error retrieving cashTransaction :', error);
            return error;
        }
    },
    create: async function (cashTransaction) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                cashTransaction.date=tools.refactorDate(cashTransaction.date);
                // Create a cashTransaction
                const createdCashTransaction = await CashTransaction.create(cashTransaction, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdCashTransaction;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating cashTransaction :', error);
            return error;
        }
    },
    update: async function (cashTransaction) {
        // Find the cashTransaction by ID
        const oldCashTransaction = await CashTransaction.findByPk(cashTransaction.id);
        if (!oldCashTransaction) {
            console.error('cashTransaction not found error');
            return null;
        }
        try {
            _.assign(oldCashTransaction, cashTransaction);
            await oldCashTransaction.save();
            return oldCashTransaction;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldCashTransaction = await CashTransaction.findByPk(id);
        if (!oldCashTransaction) {
            const error = new Error('cashTransaction not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldCashTransaction.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



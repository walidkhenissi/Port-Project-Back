const {sequelize, Bank} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const banks = await Bank.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return banks;
        } catch (error) {
            console.error('Error retrieving banks :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Bank.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting banks :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const banks = await Bank.findAll({
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return banks;
        } catch (error) {
            console.error('Error retrieving banks :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const bank = await Bank.findByPk(id, {});
            return bank;
        } catch (error) {
            console.error('Error retrieving bank :', error);
            return error;
        }
    },
    create: async function (bank) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a bank
                const createdCommission = await Bank.create(bank, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdCommission;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating bank :', error);
            return error;
        }
    },
    update: async function (bank) {
        // Find the bank by ID
        const oldBank = await Bank.findByPk(bank.id);
        if (!oldBank) {
            console.error('bank not found error');
            return null;
        }
        try {
            oldBank.name = bank.name;
            await oldBank.save();
            return oldBank;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldBank = await Bank.findByPk(id);
        if (!oldBank) {
            const error = new Error('bank not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldBank.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



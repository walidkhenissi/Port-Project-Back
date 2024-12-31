const {sequelize, Balance, Merchant, Shipowner} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const balances = await Balance.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
                order: criteria.sort
            });
            return balances;
        } catch (error) {
            console.error('Error retrieving balances :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Balance.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting balances :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const balances = await Balance.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return balances;
        } catch (error) {
            console.error('Error retrieving balances :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const balance = await Balance.findByPk(id, {
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
            });
            return balance;
        } catch (error) {
            console.error('Error retrieving balance :', error);
            return error;
        }
    },
    create: async function (balance) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a balance
                const createdBalance = await Balance.create(balance, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdBalance;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating balance :', error);
            return error;
        }
    },
    update: async function (balance) {
        // Find the balance by ID
        const oldBalance = await Balance.findByPk(balance.id);
        if (!oldBalance) {
            const error = new Error('balance not found error');
            console.error(error.message);
            throw error;
        }
        try {
            _.assign(oldBalance, balance);
            await oldBalance.save();
            return oldBalance;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the sale by ID
        const oldBalance = await Balance.findByPk(id);
        if (!oldBalance) {
            const error = new Error('balance not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldBalance.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    }
}



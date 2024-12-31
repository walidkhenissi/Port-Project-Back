const {sequelize, BoxesTransaction, Merchant, Shipowner} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const boxesTransactions = await BoxesTransaction.findAll({
                where: criteria.where,
                // include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
                order: criteria.sort
            });
            return boxesTransactions;
        } catch (error) {
            console.error('Error retrieving boxesTransactions :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await BoxesTransaction.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting boxesTransaction :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            // console.log("=====================>criteria : " + JSON.stringify(criteria));
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            // console.log("=====================>criteria : " + JSON.stringify(criteria));
            const boxesTransactions = await BoxesTransaction.findAll({
                where: criteria.where,
                // include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return boxesTransactions;
        } catch (error) {
            console.error('Error retrieving boxesTransaction :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const boxesTransaction = await BoxesTransaction.findByPk(id, {
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
            });
            return boxesTransaction;
        } catch (error) {
            console.error('Error retrieving boxesTransaction :', error);
            return error;
        }
    },
    create: async function (boxesTransaction) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a boxesTransaction
                const createdBoxesTransaction = await BoxesTransaction.create(boxesTransaction, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdBoxesTransaction;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating boxesTransaction :', error);
            return error;
        }
    },
    update: async function (boxesTransaction) {
        // Find the boxesTransaction by ID
        const oldBoxesTransaction = await BoxesTransaction.findByPk(boxesTransaction.id);
        if (!oldBoxesTransaction) {
            const error = new Error('boxesTransaction not found error');
            console.error(error.message);
            throw error;
        }
        try {
            _.assign(oldBoxesTransaction, boxesTransaction);
            await oldBoxesTransaction.save();
            return oldBoxesTransaction;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the sale by ID
        const oldBoxesTransaction = await BoxesTransaction.findByPk(id);
        if (!oldBoxesTransaction) {
            const error = new Error('boxesTransaction not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldBoxesTransaction.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
    findOne: async function (criteria) {
        try {
            const boxesTransaction = await BoxesTransaction.findOne(criteria, {
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
            });
            return boxesTransaction;
        } catch (error) {
            console.error('Error retrieving boxesTransaction :', error);
            return error;
        }
    },

}



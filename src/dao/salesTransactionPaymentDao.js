const {
    sequelize, SalesTransactionPayment, SalesTransaction, PaymentType, Payment
} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactionPayments = await SalesTransactionPayment.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return salesTransactionPayments;
        } catch (error) {
            console.error('Error retrieving salesTransactionPayments :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await SalesTransactionPayment.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting salesTransactionPayments :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactionPayments = await SalesTransactionPayment.findAll({
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return salesTransactionPayments;
        } catch (error) {
            console.error('Error retrieving salesTransactionPayments :', error);
            return error;
        }
    },
    findWithDetails: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactionPayments = await SalesTransactionPayment.findAll({
                include: [{model: SalesTransaction, as: 'salesTransaction'}, {model: PaymentType, as: 'paymentType'}],
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return salesTransactionPayments;
        } catch (error) {
            console.error('Error retrieving salesTransactionPayments :', error);
            return error;
        }
    },
    findOne: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactionPayment = await SalesTransactionPayment.findOne({
                where: criteria.where
            });
            return salesTransactionPayment;
        } catch (error) {
            console.error('Error retrieving salesTransactionPayment :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const salesTransactionPayment = await SalesTransactionPayment.findByPk(id, {
                include: [{model: SalesTransaction, as: 'salesTransaction'}, {model: Payment, as: 'payment'}],
            });
            return salesTransactionPayment;
        } catch (error) {
            console.error('Error retrieving salesTransactionPayment :', error);
            return error;
        }
    },
    create: async function (salesTransactionPayment) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a salesTransactionPayment
                const createdSalesTransactionPayment = await SalesTransactionPayment.create(salesTransactionPayment, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdSalesTransactionPayment;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating salesTransactionPayment :', error);
            return error;
        }
    },
    update: async function (salesTransactionPayment) {
        // Find the salesTransactionPayment by ID
        const oldSalesTransactionPayment = await SalesTransactionPayment.findByPk(salesTransactionPayment.id);
        if (!oldSalesTransactionPayment) {
            console.error('salesTransactionPayment not found error');
            return null;
        }
        try {
            _.assign(oldSalesTransactionPayment, salesTransactionPayment);
            await oldSalesTransactionPayment.save();
            return oldSalesTransactionPayment;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldSalesTransactionPayment = await SalesTransactionPayment.findByPk(id);
        if (!oldSalesTransactionPayment) {
            const error = new Error('salesTransactionPayment not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldSalesTransactionPayment.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



const {sequelize, SalesTransaction, Article, Merchant, Sale, PaymentInfo} = require('../models');
const {Op} = require("sequelize");

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactions = await SalesTransaction.findAll({
                where: criteria.where,
                include: [{model: Article, as: 'article'}, {model: Merchant, as: 'merchant'}],
                order: criteria.sort
            });
            return salesTransactions;
        } catch (error) {
            console.error('Error retrieving salesTransactions :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await SalesTransaction.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting salesTransactions :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactions = await SalesTransaction.findAll({
                where: criteria.where,
                include: [{model: Article, as: 'article'}, {model: Merchant, as: 'merchant'}, {model: PaymentInfo, as: 'paymentInfo'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return salesTransactions;
        } catch (error) {
            console.error('Error retrieving salesTransactions :', error);
            return error;
        }
    },
    findAll: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salesTransactions = await SalesTransaction.findAll({
                where: criteria.where,
                include: [{model: Article, as: 'article'}, {model: Merchant, as: 'merchant'}, {model: Sale, as: 'sale'}, {model: PaymentInfo, as: 'paymentInfo'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return salesTransactions;
        } catch (error) {
            console.error('Error retrieving salesTransactions :', error);
            return error;
        }
    },
    sum: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sum = await SalesTransaction.sum('totalToPayByMerchant',{where: criteria.where});
            return sum;
        } catch (error) {
            console.error('Error sum salesTransactions :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const salesTransaction = await SalesTransaction.findByPk(id, {
                include: [{model: Article, as: 'article'}, {model: Merchant, as: 'merchant'}, {
                    model: Sale,
                    as: 'sale'
                }],
            });
            return salesTransaction;
        } catch (error) {
            console.error('Error retrieving salesTransaction :', error);
            throw error;
        }
    },
    create: async function (salesTransaction) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a salesTransaction
                const createdSalesTransaction = await SalesTransaction.create(salesTransaction, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdSalesTransaction;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating salesTransaction :', error);
            return error;
        }
    },
    update: async function (salesTransaction) {
        // Find the salesTransaction by ID
        const oldSalesTransaction = await SalesTransaction.findByPk(salesTransaction.id);
        if (!oldSalesTransaction) {
            const error = new Error('salesTransaction not found error');
            console.error(error.message);
            throw error;
        }
        try {
            _.assign(oldSalesTransaction, salesTransaction);
            await oldSalesTransaction.save();
            return oldSalesTransaction;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the salesTransaction by ID
        const oldSalesTransaction = await SalesTransaction.findByPk(id);
        if (!oldSalesTransaction) {
            const error = new Error('salesTransaction not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldSalesTransaction.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
    nextSaleNumber: async function (salesTransaction) {
        let number = 0;
        const result = await SalesTransaction.findAll({
            where: {
                date: {
                    [Op.gte]: moment(salesTransaction.date).startOf('year').toDate(),
                    [Op.lte]: moment(salesTransaction.date).endOf('year').toDate()
                }
            },
            attributes: ['transactionNumber'],
            order: [['id', 'desc']]
        });
        if (result.length) {
            for (var item in result) {
                number = parseInt((result[item].transactionNumber).slice(-6));
                if (number && parseInt(number) > 0)
                    break;
            }
            if (!number || parseInt(number) <= 0)
                number = 0;
        }
        number++;
        // console.log("=====================>number : " + JSON.stringify(number));
        return number;
    }
}



const {
    sequelize, SalePayment, SalesTransaction, PaymentType, Payment, Sale, Shipowner, Address, Civility, Boat, Merchant
} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salePayments = await SalePayment.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return salePayments;
        } catch (error) {
            console.error('Error retrieving SalePayments :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await SalePayment.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting SalePayments :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salePayments = await SalePayment.findAll({
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            // console.log("=====================>salePayments : " + JSON.stringify(salePayments));
            return salePayments;
        } catch (error) {
            console.error('Error retrieving SalePayments :', error);
            return error;
        }
    },
    findWithDetails: async function (criteria) {
        try {
            // console.log("=====================>criteria : " + JSON.stringify(criteria));
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            // console.log("=====================>criteria : " + JSON.stringify(criteria));
            let salePayments = await SalePayment.findAll({
                include: [{model: Sale, as: 'sale'}, {model: PaymentType, as: 'paymentType'}, {
                    model: Payment,
                    as: 'payment'
                }],
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            // console.log("=====================>salePayments : " + JSON.stringify(salePayments));
            salePayments = JSON.parse(JSON.stringify(salePayments));
            for (var item in salePayments) {
                if(salePayments[item].sale.shipOwnerId) {
                    let producer = await Shipowner.findByPk(salePayments[item].sale.shipOwnerId);
                    salePayments[item].producer=producer;
                }else if(salePayments[item].sale.merchantId) {
                    let producer = await Merchant.findByPk(salePayments[item].sale.merchantId);
                    salePayments[item].producer=producer;
                }
            }
            return salePayments;
        } catch (error) {
            console.error('Error retrieving SalePayments :', error);
            return error;
        }
    },
    findOne: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const salePayment = await SalePayment.findOne({
                where: criteria.where
            });
            return salePayment;
        } catch (error) {
            console.error('Error retrieving SalePayment :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const salePayment = await SalePayment.findByPk(id, {
                include: [{model: Sale, as: 'sale'}, {model: PaymentType, as: 'paymentType'}, {
                    model: Payment,
                    as: 'payment'
                }],
            });
            return salePayment;
        } catch (error) {
            console.error('Error retrieving salePayment :', error);
            return error;
        }
    },
    create: async function (salesTransactionPayment) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a salesTransactionPayment
                const createdSalePayment = await SalePayment.create(salesTransactionPayment, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdSalePayment;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating SalePayment :', error);
            return error;
        }
    },
    update: async function (salePayment) {
        // Find the salePayment by ID
        const oldSalePayment = await SalePayment.findByPk(salePayment.id);
        if (!oldSalePayment) {
            console.error('salePayment not found error');
            return null;
        }
        try {
            _.assign(oldSalePayment, salePayment);
            await oldSalePayment.save();
            return oldSalePayment;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldSalePayment = await SalePayment.findByPk(id);
        if (!oldSalePayment) {
            const error = new Error('SalePayment not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldSalePayment.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



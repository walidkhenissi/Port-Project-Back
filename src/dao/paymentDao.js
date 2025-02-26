const {sequelize, Payment, Article, Merchant, Sale, PaymentType, Bank, ConsumptionInfo, SalePayment} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const payments = await Payment.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return payments;
        } catch (error) {
            console.error('Error retrieving payments :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Payment.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting payments :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const payments = await Payment.findAll({
                include: [{model: Merchant, as: 'merchant'}, {model: PaymentType, as: 'paymentType'}, {
                    model: ConsumptionInfo,
                    as: 'consumptionInfo'
                }],
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return payments;
        } catch (error) {
            console.error('Error retrieving payments :', error);
            return error;
        }
    },
    findAll: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const payments = await Payment.findAll({
                include: [
                    {model: PaymentType, as: 'paymentType'},
                    {
                        model: SalePayment,
                        as: 'salePayments',
                        include: [
                            {
                                model: Sale,
                                as: 'sale'
                            }


                        ]
                    }
                ],
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return payments;
        } catch (error) {
            console.error('Error retrieving payments :', error);
            return error;
        }
    },
    sum: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sum = await Payment.sum('value', {where: criteria.where});
            return sum;
        } catch (error) {
            console.error('Error sum payments :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const payment = await Payment.findByPk(id, {
                include: [{model: PaymentType, as: 'paymentType'}, {model: Bank, as: 'bank'},
                    {model: ConsumptionInfo, as: 'consumptionInfo'}, {model: Merchant, as: 'merchant'}],
            });
            return payment;
        } catch (error) {
            console.error('Error retrieving payment :', error);
            throw error;
        }
    },
    create: async function (payment) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                payment.isStartBalance = false;
                // Create a payment
                const createdPayment = await Payment.create(payment, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdPayment;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating payment :', error);
            return error;
        }
    },
    update: async function (payment) {
        // Find the payment by ID
        const oldPayment = await Payment.findByPk(payment.id);
        if (!oldPayment) {
            const error = new Error('payment not found error');
            console.error(error.message);
            throw error;
        }
        try {
            _.assign(oldPayment, payment);
            await oldPayment.save();
            return oldPayment;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the salesTransaction by ID
        const oldPayment = await Payment.findByPk(id);
        if (!oldPayment) {
            const error = new Error('payment not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldPayment.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



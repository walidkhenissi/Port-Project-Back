const {sequelize, Sale, Merchant, Shipowner, SalesTransaction, Boat, Payment, PaymentInfo, SalePayment, PaymentType,
    SalesTransactionPayment
} = require('../models');
const {Op} = require("sequelize");

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sales = await Sale.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}],
                order: criteria.sort
            });
            return sales;
        } catch (error) {
            console.error('Error retrieving sales :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Sale.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting sales :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sales = await Sale.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipOwner'}, {model: Merchant, as: 'merchant'}, {model: PaymentInfo, as: 'paymentInfo'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return sales;
        } catch (error) {
            console.error('Error retrieving sales :', error);
            return error;
        }
    },
    findAll: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sales = await Sale.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipOwner'}, {model: PaymentInfo, as: 'paymentInfo'},
                    {model:SalePayment,as:'salePayments',include: [
                            {
                                model: PaymentType,
                                as: 'paymentType',
                                attributes: ['name']
                            },
                            { model:Payment,
                                as:'payment'
                            }
                        ]
                    }],

                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return sales;
        } catch (error) {
            console.error('Error retrieving sales :', error);
            return error;
        }
    },
    getSoldeInitial : async function (criteria) {
        try {
            if (!criteria.where ||!criteria.where.startDate) {
                console.log("Aucune date initiale spécifiée, solde initial = 0");
                return 0;
            }
            const startDate = criteria.where.startDate;
            criteria.where.date = {[Op.lt]: startDate};
            delete criteria.where.startDate;
            const totalVents = await Sale.sum('totalToPay', {where:criteria.where });
            const totalReglements = await Sale.sum('totalPaid',{
                where:criteria.where,
                include: [{
                    model: SalePayment ,as: 'salePayments',include: [
                        {
                            model: PaymentType,
                            as: 'paymentType',
                            where: {
                                name: { [Op.ne]: 'Remise' }
                            },
                            required: true
                        }],
                    required: true
                }]
            });

            const soldeInitial =    (totalVents || 0) - (totalReglements || 0) ;
            return soldeInitial;

        } catch (error) {
            console.error('Error sum salesTransactions :', error);
            return error;
        }
    },

    sum: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sum = await Sale.sum('total',{where: criteria.where});
            return sum;
        } catch (error) {
            console.error('Error sum sales :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const sale = await Sale.findByPk(id, {
                include: [
                    {model: Shipowner, as: 'shipOwner'},
                    {model: Merchant, as: 'merchant'},
                    {model: Boat, as: 'boat'},
                    {model: SalesTransaction, as: 'saleTransactions'}
                ],
            });
            return sale;
        } catch (error) {
            console.error('Error retrieving sale :', error);
            return error;
        }
    },
    create: async function (sale) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a sale
                const createdSale = await Sale.create(sale, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdSale;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating sale :', error);
            return error;
        }
    },
    update: async function (sale) {
        // Find the sale by ID
        const oldSale = await Sale.findByPk(sale.id);
        if (!oldSale) {
            const error = new Error('sale not found error');
            console.error(error.message);
            throw error;
        }
        try {
            _.assign(oldSale, sale);
            await oldSale.save();
            return oldSale;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the sale by ID
        const oldSale = await Sale.findByPk(id);
        if (!oldSale) {
            const error = new Error('Shipowner not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldSale.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
    nextSaleNumber: async function (sale) {
        let number = 0;
        const result = await Sale.findAll({
            where: {
                date: {
                    [Op.gte]: moment(sale.date).startOf('year').toDate(),
                    [Op.lte]: moment(sale.date).endOf('year').toDate()
                }
            },
            attributes: ['number'],
            order: [['id', 'desc']]
        });
        if (result.length) {
            for (var item in result) {
                number = parseInt((result[item].number).slice(-6));
                if (number && parseInt(number) > 0)
                    break;
            }
            if (!number || parseInt(number) <= 0)
                number = 0;
        }
        number++;
        return number;
    }
}



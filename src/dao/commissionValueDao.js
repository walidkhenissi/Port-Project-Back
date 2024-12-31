const {sequelize, Commission, CommissionValue, Beneficiary, SalesTransaction, Payment} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissionValues = await CommissionValue.findAll({
                where: criteria.where,
                include: [{model: Commission, as: 'commission'}, {model: SalesTransaction, as: 'salesTransaction'}],
                order: criteria.sort
            });
            return commissionValues;
        } catch (error) {
            console.error('Error retrieving commissionValues :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await CommissionValue.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting commissionValues :', error);
            return error;
        }
    },
    sum: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const sum = await CommissionValue.sum('value',{where: criteria.where});
            return sum;
        } catch (error) {
            console.error('Error sum CommissionValue :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissionValues = await CommissionValue.findAll({
                where: criteria.where,
                include: [{model: Commission, as: 'commission'}, {model: SalesTransaction, as: 'salesTransaction'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return commissionValues;
        } catch (error) {
            console.error('Error retrieving commissionValues :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const commissionValue = await CommissionValue.findByPk(id, {
                include: [{model: Commission, as: 'commission'}, {model: SalesTransaction, as: 'salesTransaction'}],
            });
            return commissionValue;
        } catch (error) {
            console.error('Error retrieving commissionValue :', error);
            return error;
        }
    },
    create: async function (commissionValue) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a commissionValue
                const createdCommissionValue = await CommissionValue.create(commissionValue, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdCommissionValue;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating commissionValue :', error);
            return error;
        }
    },
    update: async function (commissionValue) {
        // Find the commissionValue by ID
        const oldCommissionValue = await CommissionValue.findByPk(commissionValue.id);
        if (!oldCommissionValue) {
            console.error('commissionValue not found error');
            return null;
        }
        try {
            _.assign(oldCommissionValue, commissionValue);
            await oldCommissionValue.save();
            return oldCommissionValue;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldCommissionValue = await CommissionValue.findByPk(id);
        if (!oldCommissionValue) {
            const error = new Error('commissionValue not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldCommissionValue.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



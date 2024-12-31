const {sequelize, Commission, CommissionHistory} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissionHistories = await CommissionHistory.findAll({
                where: criteria.where,
                include: [{model: Commission, as: 'Commission'}],
                order: criteria.sort
            });
            return commissionHistories;
        } catch (error) {
            console.error('Error retrieving commissionHistories :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await CommissionHistory.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting commissionHistories :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissionHistories = await CommissionHistory.findAll({
                where: criteria.where,
                include: [{model: Commission, as: 'Commission'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return commissionHistories;
        } catch (error) {
            console.error('Error retrieving commissionHistories :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const commissionHistory = await CommissionHistory.findByPk(id, {
                include: [{model: Commission, as: 'Commission'}]
            });
            return commissionHistory;
        } catch (error) {
            console.error('Error retrieving commissionHistory :', error);
            return error;
        }
    },
    create: async function (commissionHistory) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a commissionHistory
                const createdCommissionHistory = await CommissionHistory.create(commissionHistory, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdCommissionHistory;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating commissionHistory :', error);
            return error;
        }
    },
    update: async function (commissionHistory) {
        // Find the commissionHistory by ID
        const oldCommissionHistory = await CommissionHistory.findByPk(commissionHistory.id);
        if (!oldCommissionHistory) {
            console.error('commissionHistory not found error');
            return null;
        }
        try {
            oldCommissionHistory.value = commissionHistory.value;
            oldCommissionHistory.isSellerCommission = commissionHistory.isSellerCommission;
            oldCommissionHistory.isCustomerCommission = commissionHistory.isCustomerCommission;
            oldCommissionHistory.isPercentValue = commissionHistory.isPercentValue;
            oldCommissionHistory.isPerUnitValue = commissionHistory.isPerUnitValue;
            oldCommissionHistory.startDate = commissionHistory.startDate;
            oldCommissionHistory.endDate = commissionHistory.endDate;
            await oldCommissionHistory.save();
            return oldCommissionHistory;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldCommissionHistory = await CommissionHistory.findByPk(id);
        if (!oldCommissionHistory) {
            const error = new Error('commissionHistory not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldCommissionHistory.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



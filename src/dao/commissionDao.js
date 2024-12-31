const {sequelize, Commission, CommissionHistory, CommissionBeneficiary, Beneficiary} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissions = await Commission.findAll({
                where: criteria.where,
                include: [{model: CommissionHistory, as: 'CommissionHistories'}, {
                    model: CommissionBeneficiary,
                    as: 'CommissionBeneficiaries'
                }, {
                    model: Beneficiary,
                    as: 'beneficiaries'
                }],
                order: criteria.sort
            });
            return commissions;
        } catch (error) {
            console.error('Error retrieving commissions :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Commission.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting commissions :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissions = await Commission.findAll({
                where: criteria.where,
                include: [{model: CommissionHistory, as: 'CommissionHistories'}, {
                    model: CommissionBeneficiary,
                    as: 'CommissionBeneficiaries'
                }, {
                    model: Beneficiary,
                    as: 'beneficiaries'
                }],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return commissions;
        } catch (error) {
            console.error('Error retrieving commissions :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const commission = await Commission.findByPk(id, {
                include: [{model: CommissionHistory, as: 'CommissionHistories'}, {
                    model: CommissionBeneficiary,
                    as: 'CommissionBeneficiaries'
                }, {
                    model: Beneficiary,
                    as: 'beneficiaries'
                }]
            });
            return commission;
        } catch (error) {
            console.error('Error retrieving commission :', error);
            return error;
        }
    },
    create: async function (commission) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a commission
                const createdCommission = await Commission.create(commission, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdCommission;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating commission :', error);
            return error;
        }
    },
    update: async function (commission) {
        // Find the commission by ID
        const oldCommission = await Commission.findByPk(commission.id);
        if (!oldCommission) {
            console.error('commission not found error');
            return null;
        }
        try {
            oldCommission.name = commission.name;
            await oldCommission.save();
            return oldCommission;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldCommission = await Commission.findByPk(id);
        if (!oldCommission) {
            const error = new Error('commission not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldCommission.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



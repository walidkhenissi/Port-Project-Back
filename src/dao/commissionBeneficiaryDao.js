const {sequelize, Commission, CommissionBeneficiary, Beneficiary} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissionBeneficiaries = await CommissionBeneficiary.findAll({
                where: criteria.where,
                include: [{model: Commission, as: 'Commission'}, {model: Beneficiary, as: 'Beneficiary'}],
                order: criteria.sort
            });
            return commissionBeneficiaries;
        } catch (error) {
            console.error('Error retrieving commissionBeneficiaries :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await CommissionBeneficiary.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting commissionBeneficiaries :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const commissionBeneficiaries = await CommissionBeneficiary.findAll({
                where: criteria.where,
                include: [{model: Commission, as: 'Commission'}, {model: Beneficiary, as: 'Beneficiary'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return commissionBeneficiaries;
        } catch (error) {
            console.error('Error retrieving commissionBeneficiaries :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const commissionBeneficiary = await CommissionBeneficiary.findByPk(id, {
                include: [{model: Commission, as: 'Commission'}, {model: Beneficiary, as: 'Beneficiary'}],
            });
            return commissionBeneficiary;
        } catch (error) {
            console.error('Error retrieving commissionBeneficiary :', error);
            return error;
        }
    },
    create: async function (commissionBeneficiary) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a commissionBeneficiary
                const createdCommissionBeneficiary = await CommissionBeneficiary.create(commissionBeneficiary, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdCommissionBeneficiary;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating commissionBeneficiary :', error);
            return error;
        }
    },
    update: async function (commissionBeneficiary) {
        // Find the commissionBeneficiary by ID
        const oldCommissionBeneficiary = await CommissionBeneficiary.findByPk(commissionBeneficiary.id);
        if (!oldCommissionBeneficiary) {
            console.error('commissionBeneficiary not found error');
            return null;
        }
        try {
            oldCommissionBeneficiary.startDate = commissionBeneficiary.startDate;
            oldCommissionBeneficiary.endDate = commissionBeneficiary.endDate;
            oldCommissionBeneficiary.commissionId = commissionBeneficiary.commissionId || (commissionBeneficiary.Commission ? commissionBeneficiary.Commission.id : undefined);
            oldCommissionBeneficiary.beneficiaryId = commissionBeneficiary.beneficiaryId || (commissionBeneficiary.Beneficiary ? commissionBeneficiary.Beneficiary.id : undefined);
            await oldCommissionBeneficiary.save();
            return oldCommissionBeneficiary;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldCommissionBeneficiary = await CommissionBeneficiary.findByPk(id);
        if (!oldCommissionBeneficiary) {
            const error = new Error('commissionBeneficiary not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldCommissionBeneficiary.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



const {sequelize, Commission, CommissionBeneficiary, Beneficiary} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const beneficiaries = await Beneficiary.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return beneficiaries;
        } catch (error) {
            console.error('Error retrieving beneficiaries :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Beneficiary.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting beneficiaries :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            // console.log("=====================>Commission : " + JSON.stringify(Commission));
            const commissionBeneficiaries = await Beneficiary.findAll({
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return commissionBeneficiaries;
        } catch (error) {
            console.error('Error retrieving beneficiaries :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const beneficiary = await Beneficiary.findByPk(id, {
                include: [{model: CommissionBeneficiary, as: 'CommissionBeneficiaries'}, {
                    model: Commission,
                    as: 'commissions'
                }]
            });
            return beneficiary;
        } catch (error) {
            console.error('Error retrieving beneficiary :', error);
            return error;
        }
    },
    create: async function (beneficiary) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a beneficiary
                const createdBeneficiary = await Beneficiary.create(beneficiary, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdBeneficiary;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating beneficiary :', error);
            return error;
        }
    },
    update: async function (beneficiary) {
        // Find the beneficiary by ID
        const oldBeneficiary = await Beneficiary.findByPk(beneficiary.id);
        if (!oldBeneficiary) {
            console.error('beneficiary not found error');
            return null;
        }
        try {
            oldBeneficiary.name = beneficiary.name;
            await oldBeneficiary.save();
            return oldBeneficiary;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldBeneficiary = await Beneficiary.findByPk(id);
        if (!oldBeneficiary) {
            const error = new Error('beneficiary not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldBeneficiary.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



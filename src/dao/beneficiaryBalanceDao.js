const {sequelize, Commission, CommissionBeneficiary, BeneficiaryBalance, Beneficiary} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const beneficiaryBalances = await BeneficiaryBalance.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return beneficiaryBalances;
        } catch (error) {
            console.error('Error retrieving beneficiaryBalances :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await BeneficiaryBalance.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting beneficiaryBalances :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            // console.log("=====================>Commission : " + JSON.stringify(Commission));
            const beneficiaryBalances = await BeneficiaryBalance.findAll({
                include: [{model: Beneficiary, as: 'beneficiary'}],
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return beneficiaryBalances;
        } catch (error) {
            console.error('Error retrieving beneficiaryBalances :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const beneficiaryBalance = await BeneficiaryBalance.findByPk(id, {
                include: [{model: Beneficiary, as: 'beneficiary'}]
            });
            return beneficiaryBalance;
        } catch (error) {
            console.error('Error retrieving beneficiaryBalance :', error);
            return error;
        }
    },
    create: async function (beneficiary) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a beneficiary
                const createdBeneficiaryBalance = await BeneficiaryBalance.create(beneficiary, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdBeneficiaryBalance;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating beneficiaryBalance :', error);
            return error;
        }
    },
    update: async function (beneficiary) {
        // Find the beneficiary by ID
        const oldBeneficiaryBalance = await BeneficiaryBalance.findByPk(beneficiary.id);
        if (!oldBeneficiaryBalance) {
            console.error('beneficiaryBalance not found error');
            return null;
        }
        try {
            oldBeneficiaryBalance.name = beneficiary.name;
            await oldBeneficiaryBalance.save();
            return oldBeneficiaryBalance;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldBeneficiaryBalance = await BeneficiaryBalance.findByPk(id);
        if (!oldBeneficiaryBalance) {
            const error = new Error('beneficiaryBalance not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldBeneficiaryBalance.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}



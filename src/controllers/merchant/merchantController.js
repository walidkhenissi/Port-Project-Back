var router = require('express').Router();
const {Merchant, Civility, Shipowner, Boat} = require('../../models');
const {Address} = require('../../models');
const {sequelize} = require('../../models');
const Response = require("../../utils/response");
const saleDao = require("../../dao/saleDao");
const salesTransactionDao = require("../../dao/salesTransactionDao");
const balanceDao = require("../../dao/balanceDao");

router.post('/create', async (req, res) => {
    // console.log("=====================>balance : " + JSON.stringify("======================>create"));
    const merchant = req.body;
    try {
        // Start a transaction
        const transaction = await sequelize.transaction();
        merchant.civilityId = merchant.civility ? merchant.civility.id : undefined;
        merchant.name = merchant.firstName + ' ' + merchant.lastName;
        try {
            if (merchant.address && (merchant.address.street || merchant.address.city || merchant.address.postalCode)) {
                // Create an address
                const newAddress = await Address.create(merchant.address, {transaction});
                merchant.addressId = newAddress.id;
            }
            // Create a merchant with the associated address
            const newMerchant = await Merchant.create(merchant, {transaction});

            // Commit the transaction
            await transaction.commit();
            const response = new Response();
            response.data = newMerchant;
            res.status(201).json(response);
        } catch (error) {
            // Rollback the transaction in case of an error
            await transaction.rollback();
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    } catch (error) {
        console.error('Error creating merchant and address:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await router.find(criteria);
        const count = await router.count({where: whereCriteria});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving merchants:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.find = async function (criteria) {
    try {
        // console.log("=====================>Merchant.find.criteria : " + JSON.stringify(criteria));
        criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
        // console.log("=====================>Merchant.find.criteria : " + JSON.stringify(criteria));
        const merchants = await Merchant.findAll({
            where: criteria.where,
            include: [{model: Address, as: 'address'}, {model: Civility, as: 'civility'}],
            limit: criteria.limit,
            offset: criteria.skip,
            order: criteria.sort
        });
        return merchants;
    } catch (error) {
        console.error('Error retrieving merchants :', error);
        return error;
    }
}
router.count = async function (criteria) {
    try {
        criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
        const count = await Merchant.count({where: criteria.where});
        return count;
    } catch (error) {
        console.error('Error counting Merchants :', error);
        return error;
    }
}

router.delete('/remove', async (req, res) => {
    const id = req.query.id;

    try {
        // Find the merchant by ID
        const merchant = await Merchant.findByPk(id);
        // console.log("=====================>merchant : " + JSON.stringify(merchant));
        // Check if the merchant exists
        if (!merchant) {
            return res.status(404).json(new Response({error: 'Merchant not found'}, true));
        }
        //Chek Sales
        const salesCount = await saleDao.count({where: {merchantId: id}});
        if (salesCount && salesCount > 0)
            return res.status(404).json(new Response({msg: "Impossible de supprimer le commerçant. Une ou plusieurs vente(s) attachée(s)"}, true));
        //Chek SalesTransactions
        const salesTransactionsCount = await salesTransactionDao.count({where: {merchantId: id}});
        if (salesTransactionsCount && salesTransactionsCount > 0)
            return res.status(404).json(new Response({msg: "Impossible de supprimer le commerçant. Une ou plusieurs opération(s) de vente attachée(s)"}, true));
        //Check balance
        const balances = await balanceDao.list({where: {merchantId: id}});
        for (const balancesKey in balances) {
            const balance = balances[balancesKey];
            await balance.destroy();
        }
        //Check addresses
        if (merchant.addressId) {
            await Address.destroy({where: {id: merchant.addressId}});
        }
        // Delete the merchant
        await merchant.destroy();
        res.status(200).json(new Response({message: 'Merchant deleted successfully'}));
    } catch (error) {
        console.error('Error deleting merchant:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const toUpdateObject = req.body;
    const id = toUpdateObject.id;
    try {
        // Find the merchant by ID and include its associated address
        const merchant = await Merchant.findByPk(id, {
            include: [{model: Address, as: 'address'}, {
                model: Civility,
                as: 'civility'
            }]
        });
        if (!merchant) {
            return res.status(404).json(new Response({error: 'Merchant not found'}, true));
        }
        // Update merchant properties based on request body
        merchant.firstName = toUpdateObject.firstName || merchant.firstName;
        merchant.lastName = toUpdateObject.lastName || merchant.lastName;
        merchant.name = merchant.firstName + ' ' + merchant.lastName;
        merchant.civilityId = toUpdateObject.civility.id || merchant.civility.id;
        merchant.socialReason = toUpdateObject.socialReason || merchant.socialReason;
        merchant.taxRegistrationNumber = toUpdateObject.taxRegistrationNumber || merchant.taxRegistrationNumber;
        merchant.phoneNumber = toUpdateObject.phoneNumber || merchant.phoneNumber;
        merchant.enabled = tools.isFalsey(toUpdateObject.enabled) ? merchant.enabled : toUpdateObject.enabled;
        merchant.civility = toUpdateObject.civility || merchant.civility;
        // Update address properties based on request body
        if (toUpdateObject.address) {
            if (!merchant.address) {
                // If merchant doesn't have an associated address, create a new one
                const newAddress = await Address.create(toUpdateObject.address);
                merchant.addressId = newAddress.id;
            } else {
                // If merchant already has an associated address, update its properties
                // console.log("=====================>toUpdateObject : " + JSON.stringify(toUpdateObject));
                merchant.address.street = toUpdateObject.address.street || merchant.address.street;
                merchant.address.city = toUpdateObject.address.city || merchant.address.city;
                merchant.address.postalCode = toUpdateObject.address.postalCode || merchant.address.postalCode;
                // console.log("=====================>merchant : " + JSON.stringify(merchant));
                // Save the updated address
                await merchant.address.save();
            }
        }
        // Save the updated merchant
        await merchant.save();
        res.status(200).json(new Response(merchant));
    } catch (error) {
        console.error('Error updating merchant:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;

    try {
        // Find the merchant by ID and include its associated address
        const merchant = await Merchant.findByPk(id, {
            include: [{model: Address, as: 'address'}, {
                model: Civility,
                as: 'civility'
            }]
        });
        // console.log("=====================>get merchant : " + JSON.stringify(merchant));
        if (!merchant) {
            return res.status(404).json(new Response({error: 'Merchant not found'}, true));
        }
        res.status(200).json(new Response(merchant));
    } catch (error) {
        console.error('Error retrieving merchant:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

module.exports = router;

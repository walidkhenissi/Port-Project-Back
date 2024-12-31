var router = require('express').Router();
const dao = require("../dao/boxesTransactionDao");
const saleDao = require("../dao/saleDao");
const salesTransactionDao = require("../dao/salesTransactionDao");
const boxesBalanceController = require("../controllers/boxesBalanceController");
const Response = require("../utils/response");
const {sequelize, BoxesTransaction, Merchant, Shipowner} = require("../models");
const {QueryTypes, Op} = require("sequelize");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving boxesTransactions :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving boxesTransactions :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving boxesTransactions :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const boxesTransaction = req.body;
    let result;
    try {
        if (!_.isNumber(parseInt(boxesTransaction.credit)))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!_.isNumber(parseInt(boxesTransaction.debit)))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (tools.isFalsey(boxesTransaction.shipOwnerId) && tools.isFalsey(boxesTransaction.merchantId))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let criteria = {
            where: {
                date: {
                    [Op.gte]: moment(boxesTransaction.date).startOf('day').toDate(),
                    [Op.lte]: moment(boxesTransaction.date).endOf('day').toDate()
                }
            }
        };
        if (!tools.isFalsey(boxesTransaction.shipOwnerId))
            criteria.where.shipOwnerId = boxesTransaction.shipOwnerId;
        else if (!tools.isFalsey(boxesTransaction.merchantId))
            criteria.where.merchantId = boxesTransaction.merchantId;
        const persistedTransaction = await dao.findOne(criteria);
        if (persistedTransaction) {
            if (!tools.isFalsey(boxesTransaction.shipOwnerId))
                persistedTransaction.debit = boxesTransaction.debit;
            else if (!tools.isFalsey(boxesTransaction.merchantId))
                persistedTransaction.credit = boxesTransaction.credit;
            persistedTransaction.balance = persistedTransaction.credit - persistedTransaction.debit;//Will be updated
            result = await dao.update(persistedTransaction);
        } else {
            let ownerTransaction;
            if (!tools.isFalsey(boxesTransaction.shipOwnerId)) {
                ownerTransaction = await Shipowner.findByPk(boxesTransaction.shipOwnerId);
                if (!tools.isFalsey(boxesTransaction.debit) && boxesTransaction.debit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
            } else if (!tools.isFalsey(boxesTransaction.merchantId)) {
                ownerTransaction = await Merchant.findByPk(boxesTransaction.merchantId);
                if (!tools.isFalsey(boxesTransaction.credit) && boxesTransaction.credit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
            }
            if (!ownerTransaction)
                return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
            else
                boxesTransaction.name = ownerTransaction.name;
            boxesTransaction.merchantSalesCredit = 0;
            if (tools.isFalsey(boxesTransaction.isCommissionaryTransaction))
                boxesTransaction.isCommissionaryTransaction = false;
            boxesTransaction.balance = boxesTransaction.credit - boxesTransaction.debit;//Will be updated
            result = await dao.create(boxesTransaction);
        }
        if (!tools.isFalsey(boxesTransaction.shipOwnerId))
            await router.persistForShipOwnerAsProducer(boxesTransaction.shipOwnerId, boxesTransaction.date);
        else if (!tools.isFalsey(boxesTransaction.merchantId))
            await router.persistForMerchantAsCustomer(boxesTransaction.merchantId, boxesTransaction.date);
        res.status(201).json(new Response(result));
    } catch (error) {
        console.error('Error creating boxesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const boxesTransaction = req.body;
    let result;
    try {
        if (!_.isNumber(parseInt(boxesTransaction.credit)))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!_.isNumber(parseInt(boxesTransaction.debit)))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let criteria = {
            where: {
                id: {[Op.ne]: boxesTransaction.id},
                date: {
                    [Op.gte]: moment(boxesTransaction.date).startOf('day').toDate(),
                    [Op.lte]: moment(boxesTransaction.date).endOf('day').toDate()
                }
            }
        };
        if (!tools.isFalsey(boxesTransaction.shipOwnerId))
            criteria.where.shipOwnerId = boxesTransaction.shipOwnerId;
        else if (!tools.isFalsey(boxesTransaction.merchantId))
            criteria.where.merchantId = boxesTransaction.merchantId;
        const persistedTransaction = await dao.findOne(criteria);
        if (persistedTransaction) {
            if (!tools.isFalsey(boxesTransaction.shipOwnerId))
                persistedTransaction.debit = boxesTransaction.debit;
            else if (!tools.isFalsey(boxesTransaction.merchantId))
                persistedTransaction.credit = boxesTransaction.credit;
            persistedTransaction.balance = persistedTransaction.credit - persistedTransaction.debit;//Will be updated
            if (!tools.isFalsey(persistedTransaction.shipOwnerId) && !tools.isFalsey(persistedTransaction.debit) && persistedTransaction.debit > 0)
                persistedTransaction.isCommissionaryTransaction = true;
            else if (!tools.isFalsey(persistedTransaction.merchantId) && !tools.isFalsey(persistedTransaction.credit) && persistedTransaction.credit > 0)
                persistedTransaction.isCommissionaryTransaction = true;
            else
                persistedTransaction.isCommissionaryTransaction = false;
            await dao.remove(boxesTransaction.id);
            result = await dao.update(persistedTransaction);
        } else {
            let ownerTransaction;
            if (!tools.isFalsey(boxesTransaction.shipOwnerId)) {
                ownerTransaction = await Shipowner.findByPk(boxesTransaction.shipOwnerId);
                if (!tools.isFalsey(boxesTransaction.debit) && boxesTransaction.debit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
                else
                    boxesTransaction.isCommissionaryTransaction = false;
            } else if (!tools.isFalsey(boxesTransaction.merchantId)) {
                ownerTransaction = await Merchant.findByPk(boxesTransaction.merchantId);
                if (!tools.isFalsey(boxesTransaction.credit) && boxesTransaction.credit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
                else
                    boxesTransaction.isCommissionaryTransaction = false;
            }
            if (!ownerTransaction)
                return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
            else
                boxesTransaction.name = ownerTransaction.name;
            boxesTransaction.merchantSalesCredit = 0;
            if (tools.isFalsey(boxesTransaction.isCommissionaryTransaction))
                boxesTransaction.isCommissionaryTransaction = false;
            // boxesTransaction.balance = boxesTransaction.credit - boxesTransaction.debit;
            result = await dao.update(boxesTransaction);
        }
        if (!tools.isFalsey(boxesTransaction.shipOwnerId))
            await router.persistForShipOwnerAsProducer(boxesTransaction.shipOwnerId, boxesTransaction.date);
        else if (!tools.isFalsey(boxesTransaction.merchantId))
            await router.persistForMerchantAsCustomer(boxesTransaction.merchantId, boxesTransaction.date);
        res.status(201).json(new Response(result));
    } catch (error) {
        console.error('Error updating boxesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const transaction = await dao.get(id);
        if (!transaction) {
            const error = new Error('boxesTransaction not found error');
            return res.status(500).json(new Response(error, true));
        }
        const removed = await dao.remove(id);
        if (!tools.isFalsey(transaction.shipOwnerId))
            await router.persistForShipOwnerAsProducer(transaction.shipOwnerId, transaction.date);
        else if (!tools.isFalsey(transaction.merchantId))
            await router.persistForMerchantAsCustomer(transaction.merchantId, transaction.date);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing boxesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.persistBySalesTransaction = async function (salesTransaction, removeCase = false) {
    try {
        if (tools.isFalsey(salesTransaction.boxes))
            return;
        const sale = await saleDao.get(salesTransaction.saleId);
        if (!sale) {
            const error = new Error('Sale not found error');
            throw error;
        }
        if (removeCase) {
            const boxesTransaction = await dao.findOne({
                where: {
                    merchantId: salesTransaction.merchantId,
                    date: {
                        [Op.gte]: moment(sale.date).startOf('day').toDate(),
                        [Op.lte]: moment(sale.date).endOf('day').toDate()
                    }
                }
            });
            if (boxesTransaction) {
                boxesTransaction.debit -= salesTransaction.boxes;
                if (!boxesTransaction.debit && !boxesTransaction.credit && !boxesTransaction.merchantSalesCredit)
                    await boxesTransaction.destroy();
                else {
                    if (!boxesTransaction.credit)
                        boxesTransaction.isCommissionaryTransaction = false;
                    await dao.update(boxesTransaction);
                }
            }
        }
        await router.persistForMerchantAsCustomer(salesTransaction.merchantId, sale.date);
        //Looking for producer boxes transactions
        if (!tools.isFalsey(sale.shipOwnerId)) {
            //ShipOwner producer case
            await router.persistForShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        } else if (!tools.isFalsey(sale.merchantId)) {
            //Merchant producer case
            await router.persistForMerchantAsProducer(sale.merchantId, sale.date);
        }
    } catch (error) {
        console.error('persistBySalesTransaction error');
        throw error;
    }
}

router.persistForMerchantAsCustomer = async function (merchantId, date = new Date()) {
    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant) {
        const error = new Error('Merchant not found error');
        throw error;
    }
    const previousBoxesTransaction = await dao.find({
        where: {
            merchantId: merchantId,
            date: {'<': moment(date).startOf('day').toDate()}
        },
        sort: {date: 'DESC'},
        limit: 1
    });
    // console.log("=====================>previousBoxesTransaction : " + JSON.stringify(previousBoxesTransaction));
    // let query = "select * from salesTransactions st " +
    //     "inner join sales s on  st.saleId=s.id " +
    //     "where" +
    //     " st.merchantId = " + merchantId +
    //     " and st.boxes > 0" +
    //     " and s.date >= '" + moment(date).format(dbDateFormat) + "'" +
    //     " ORDER BY date ASC";
    // const purchasesTransactions = await sequelize.query(query, {
    //     type: QueryTypes.SELECT, raw: true
    // });
    const purchasesTransactions = await salesTransactionDao.find({
        where: {
            merchantId: merchantId,
            boxes: {'>':0},
            date: {'>=': moment(date).toDate()}
        },
        sort: {date: 'ASC'}
    });
    let purchasesTransactionsByDate = _.groupBy(purchasesTransactions, 'date');
    // console.log("=====================>purchasesTransactionsByDate : " + JSON.stringify(purchasesTransactionsByDate));
    query = "select * from salesTransactions st " +
        "inner join sales s on  st.saleId=s.id " +
        "where" +
        " s.merchantId = " + merchantId +
        " and st.boxes > 0" +
        " and s.date >= '" + moment(date).format(dbDateFormat) + "'" +
        " ORDER BY st.date ASC";
    const salesTransactions = await sequelize.query(query, {
        type: QueryTypes.SELECT, raw: true
    });
    const salesTransactionsByDate = _.groupBy(salesTransactions, 'date');
    // console.log("=====================>salesTransactionsByDate : " + JSON.stringify(salesTransactionsByDate));
    const nextBoxesTransactions = await dao.list({
        where: {
            merchantId: merchantId,
            date: {'>=': moment(date).startOf('day').toDate()}
        }
    });
    const nextBoxesTransactionsByDate = _.groupBy(nextBoxesTransactions, function (item) {
        return moment(item.date).format(dbDateFormat);
    });
    // console.log("=====================>nextBoxesTransactionsByDate : " + JSON.stringify(nextBoxesTransactionsByDate));
    let previousBalance = (previousBoxesTransaction && previousBoxesTransaction.length) ? (previousBoxesTransaction[0].balance || 0) : 0;
    let dates = _.compact(_.uniq(_.union(_.map(purchasesTransactions, 'date'), _.map(salesTransactions, 'date'), _.map(nextBoxesTransactions, function (item) {
        return moment(item.date).format(dbDateFormat);
    }))));
    // console.log("=====================>dates before sort : " + JSON.stringify(dates));
    dates = _.sortBy(dates, function (item) {
        return moment(item).toDate();
    }, 'asc');
    // console.log("=====================>dates after sort : " + JSON.stringify(dates));
    for (const dateKey in dates) {
        let date = dates[dateKey];
        let boxesTransaction = nextBoxesTransactionsByDate[date];
        const purchasesTransactionsAtDate = purchasesTransactionsByDate[date];
        const salesTransactionsAtDate = salesTransactionsByDate[date];
        if (boxesTransaction && boxesTransaction.length)
            boxesTransaction = boxesTransaction[0];
        else
            boxesTransaction = null;
        if (!boxesTransaction) {
            const transaction = {
                date: moment(date).toDate(),
                credit: 0,
                merchantSalesCredit: _.sumBy(salesTransactionsAtDate, 'boxes'),
                debit: _.sumBy(purchasesTransactionsAtDate, 'boxes'),
                balance: previousBalance + _.sumBy(salesTransactionsAtDate, 'boxes') - _.sumBy(purchasesTransactionsAtDate, 'boxes'),
                stock: 0,
                name: merchant.name,
                isCommissionaryTransaction: false,
                merchantId: merchantId
            };
            transaction.balance = previousBalance + transaction.merchantSalesCredit - transaction.debit;
            if ((!tools.isFalsey(transaction.merchantSalesCredit) && parseInt(transaction.merchantSalesCredit) != 0)
                || (!tools.isFalsey(transaction.debit) && parseInt(transaction.debit) != 0)) {
                boxesTransaction = await dao.create(transaction);
                previousBalance = boxesTransaction.balance;
            }
        } else {
            // console.log("=====================>boxesTransaction before set values : " + JSON.stringify(boxesTransaction));
            boxesTransaction.merchantSalesCredit = _.sumBy(salesTransactionsAtDate, 'boxes');
            boxesTransaction.debit = _.sumBy(purchasesTransactionsAtDate, 'boxes');
            boxesTransaction.balance = previousBalance + boxesTransaction.credit + boxesTransaction.merchantSalesCredit - boxesTransaction.debit;
            boxesTransaction.name = merchant.name;
            if ((!tools.isFalsey(boxesTransaction.credit) && parseInt(boxesTransaction.credit) != 0)
                || (!tools.isFalsey(boxesTransaction.merchantSalesCredit) && parseInt(boxesTransaction.merchantSalesCredit) != 0)
                || (!tools.isFalsey(boxesTransaction.debit) && parseInt(boxesTransaction.debit) != 0)) {
                if (!tools.isFalsey(boxesTransaction.merchantId) && !tools.isFalsey(boxesTransaction.credit) && boxesTransaction.credit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
                else
                    boxesTransaction.isCommissionaryTransaction = false;
                boxesTransaction = await dao.update(boxesTransaction);
                previousBalance = boxesTransaction.balance;
            } else {
                // console.log("=====================>deleting : " + JSON.stringify(boxesTransaction));
                await dao.remove(boxesTransaction.id);
            }
        }
    }
    await boxesBalanceController.updateByMerchant(merchantId);
    await router.updateStock(date);
}

router.persistForShipOwnerAsProducer = async function (shipOwnerId, date = new Date()) {
    const shipOwner = await Shipowner.findByPk(shipOwnerId);
    if (!shipOwner) {
        const error = new Error('ShipOwner not found error');
        throw error;
    }
    const previousBoxesTransaction = await dao.find({
        where: {
            shipOwnerId: shipOwnerId,
            date: {'<': moment(date).startOf('day').toDate()}
        },
        sort: {date: 'DESC'},
        limit: 1
    });
    const query = "select * from salesTransactions st " +
        "inner join sales s on  st.saleId=s.id " +
        "where" +
        " s.shipOwnerId = " + shipOwnerId +
        " and st.boxes > 0" +
        " and s.date >= '" + moment(date).format(dbDateFormat) + "'" +
        " ORDER BY st.date ASC";
    const salesTransactions = await sequelize.query(query, {
        type: QueryTypes.SELECT, raw: true
    });
    const salesTransactionsByDate = _.groupBy(salesTransactions, 'date');
    const nextBoxesTransactions = await dao.list({
        where: {
            shipOwnerId: shipOwnerId,
            date: {'>=': moment(date).startOf('day').toDate()}
        }
    });
    const nextBoxesTransactionsByDate = _.groupBy(nextBoxesTransactions, function (item) {
        return moment(item.date).format(dbDateFormat);
    });
    let previousBalance = (previousBoxesTransaction && previousBoxesTransaction.length) ? (previousBoxesTransaction[0].balance || 0) : 0;
    let dates = _.compact(_.uniq(_.union(_.map(salesTransactions, 'date'), _.map(nextBoxesTransactions, function (item) {
        return moment(item.date).format(dbDateFormat);
    }))));
    dates = _.sortBy(dates, function (item) {
        return moment(item).toDate();
    }, 'asc');
    for (const dateKey in dates) {
        let date = dates[dateKey];
        let boxesTransaction = nextBoxesTransactionsByDate[date];
        const salesTransactionsAtDate = salesTransactionsByDate[date];
        if (boxesTransaction && boxesTransaction.length)
            boxesTransaction = boxesTransaction[0];
        else
            boxesTransaction = null;
        if (!boxesTransaction) {
            const transaction = {
                date: moment(date).toDate(),
                credit: _.sumBy(salesTransactionsAtDate, 'boxes'),
                debit: 0,
                balance: previousBalance + _.sumBy(salesTransactionsAtDate, 'boxes'),
                stock: 0,
                name: shipOwner.name,
                merchantSalesCredit: 0,
                isCommissionaryTransaction: false,
                shipOwnerId: shipOwnerId
            };
            if ((!tools.isFalsey(transaction.credit) && parseInt(transaction.credit) != 0) || (!tools.isFalsey(transaction.debit) && parseInt(transaction.debit) != 0)) {
                boxesTransaction = await dao.create(transaction);
                previousBalance = boxesTransaction.balance;
            }
        } else {
            boxesTransaction.credit = _.sumBy(salesTransactionsAtDate, 'boxes');
            boxesTransaction.balance = previousBalance + boxesTransaction.credit - boxesTransaction.debit;
            boxesTransaction.name = shipOwner.name;
            if ((!tools.isFalsey(boxesTransaction.credit) && parseInt(boxesTransaction.credit) != 0) || (!tools.isFalsey(boxesTransaction.debit) && parseInt(boxesTransaction.debit) != 0)) {
                if (!tools.isFalsey(boxesTransaction.shipOwnerId) && !tools.isFalsey(boxesTransaction.debit) && boxesTransaction.debit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
                else
                    boxesTransaction.isCommissionaryTransaction = false;
                boxesTransaction = await dao.update(boxesTransaction);
                previousBalance = boxesTransaction.balance;
            } else
                await dao.remove(boxesTransaction.id);
        }
    }
    await boxesBalanceController.updateByShipOwner(shipOwnerId);
    await router.updateStock(date);
}

router.persistForMerchantAsProducer = async function (merchantId, date = new Date()) {
    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant) {
        const error = new Error('Merchant not found error');
        throw error;
    }
    const previousBoxesTransaction = await dao.find({
        where: {
            merchantId: merchantId,
            date: {'<': moment(date).startOf('day').toDate()}
        },
        sort: {date: 'DESC'},
        limit: 1
    });
    // let query = "select * from salesTransactions st " +
    //     "inner join sales s on  st.saleId=s.id " +
    //     "where" +
    //     " st.merchantId = " + merchantId +
    //     " and st.boxes > 0" +
    //     " and s.date >= '" + moment(date).format(dbDateFormat) + "'" +
    //     " ORDER BY date ASC";
    // const purchasesTransactions = await sequelize.query(query, {
    //     type: QueryTypes.SELECT, raw: true
    // });
    const purchasesTransactions = await salesTransactionDao.find({
        where: {
            merchantId: merchantId,
            boxes: {'>':0},
            date: {'>=': moment(date).toDate()}
        },
        sort: {date: 'ASC'}
    });
    let purchasesTransactionsByDate = _.groupBy(purchasesTransactions, 'date');
    query = "select * from salesTransactions st " +
        "inner join sales s on  st.saleId=s.id " +
        "where" +
        " s.merchantId = " + merchantId +
        " and st.boxes > 0" +
        " and s.date >= '" + moment(date).format(dbDateFormat) + "'" +
        " ORDER BY st.date ASC";
    const salesTransactions = await sequelize.query(query, {
        type: QueryTypes.SELECT, raw: true
    });
    const salesTransactionsByDate = _.groupBy(salesTransactions, 'date');
    const nextBoxesTransactions = await dao.list({
        where: {
            merchantId: merchantId,
            date: {'>=': moment(date).startOf('day').toDate()}
        }
    });
    const nextBoxesTransactionsByDate = _.groupBy(nextBoxesTransactions, function (item) {
        return moment(item.date).format(dbDateFormat);
    });
    let previousBalance = (previousBoxesTransaction && previousBoxesTransaction.length) ? (previousBoxesTransaction[0].balance || 0) : 0;
    let dates = _.compact(_.uniq(_.union(_.map(salesTransactions, 'date'), _.map(purchasesTransactions, 'date'), _.map(nextBoxesTransactions, function (item) {
        return moment(item.date).format(dbDateFormat);
    }))));
    dates = _.sortBy(dates, function (item) {
        return moment(item).toDate();
    }, 'asc');
    for (const dateKey in dates) {
        let date = dates[dateKey];
        let boxesTransaction = nextBoxesTransactionsByDate[date];
        const salesTransactionsAtDate = salesTransactionsByDate[date];
        const purchasesTransactionsAtDate = purchasesTransactionsByDate[date];
        if (boxesTransaction && boxesTransaction.length)
            boxesTransaction = boxesTransaction[0];
        else
            boxesTransaction = null;
        if (!boxesTransaction) {
            const transaction = {
                date: moment(date).toDate(),
                credit: 0,
                debit: _.sumBy(purchasesTransactionsAtDate, 'boxes'),
                merchantSalesCredit: _.sumBy(salesTransactionsAtDate, 'boxes'),
                balance: previousBalance + _.sumBy(salesTransactionsAtDate, 'boxes'),
                stock: 0,
                name: merchant.name,
                isCommissionaryTransaction: false,
                merchantId: merchantId
            };
            if ((!tools.isFalsey(transaction.credit) && parseInt(transaction.credit) != 0)
                || (!tools.isFalsey(transaction.merchantSalesCredit) && parseInt(transaction.merchantSalesCredit) != 0)
                || (!tools.isFalsey(transaction.debit) && parseInt(transaction.debit) != 0)) {
                boxesTransaction = await dao.create(transaction);
                previousBalance = boxesTransaction.balance;
            }
        } else {
            boxesTransaction.debit = _.sumBy(purchasesTransactionsAtDate, 'boxes');
            boxesTransaction.merchantSalesCredit = _.sumBy(salesTransactionsAtDate, 'boxes');
            boxesTransaction.balance = previousBalance + boxesTransaction.credit + boxesTransaction.merchantSalesCredit - boxesTransaction.debit;
            boxesTransaction.name = merchant.name;
            if ((!tools.isFalsey(boxesTransaction.credit) && parseInt(boxesTransaction.credit) != 0)
                || (!tools.isFalsey(boxesTransaction.merchantSalesCredit) && parseInt(boxesTransaction.merchantSalesCredit) != 0)
                || (!tools.isFalsey(boxesTransaction.debit) && parseInt(boxesTransaction.debit) != 0)) {
                if (!tools.isFalsey(boxesTransaction.merchantId) && !tools.isFalsey(boxesTransaction.credit) && boxesTransaction.credit > 0)
                    boxesTransaction.isCommissionaryTransaction = true;
                else
                    boxesTransaction.isCommissionaryTransaction = false;
                boxesTransaction = await dao.update(boxesTransaction);
                previousBalance = boxesTransaction.balance;
            } else
                await dao.remove(boxesTransaction.id);
        }
    }
    await boxesBalanceController.updateByMerchant(merchantId);
    await router.updateStock(date);
}

router.persistBySale = async function (sale) {
    if (sale.saleTransactions)
        for (const saleTransactionsKey in sale.saleTransactions) {
            let salesTransaction = sale.saleTransactions[saleTransactionsKey];
            await router.persistForMerchantAsCustomer(salesTransaction.merchantId, sale.date);
        }
    if (!tools.isFalsey(sale.shipOwnerId)) {
        //ShipOwner producer case
        await router.persistForShipOwnerAsProducer(sale.shipOwnerId, sale.date);
    } else if (!tools.isFalsey(sale.merchantId)) {
        //Merchant producer case
        await router.persistForMerchantAsProducer(sale.merchantId, sale.date);
    }
}

router.updateStock = async function (date = new Date()) {
    let result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('debit')), 'debit']
        ],
        raw: true,
        where: {
            shipOwnerId: {[Op.ne]: null},
            isCommissionaryTransaction: true,
            date: {[Op.lt]: moment(date).startOf('day').toDate()}
        }
    });
    let _shipOwnersDebit = (result && result.length) ? (result[0]["debit"] || 0) : 0;
    result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('credit')), 'credit']
        ],
        raw: true,
        where: {
            merchantId: {[Op.ne]: null},
            isCommissionaryTransaction: true,
            date: {[Op.lt]: moment(date).startOf('day').toDate()}
        }
    });
    let _merchantsCredit = (result && result.length) ? (result[0]["credit"] || 0) : 0;
    let previousStock = _merchantsCredit - _shipOwnersDebit;
    const nextBoxesTransactions = await dao.list({
        where: {
            isCommissionaryTransaction: true,
            date: {'>=': moment(date).startOf('day').toDate()}
        },
        sort: {date: 'ASC'}
    });
    for (const key in nextBoxesTransactions) {
        _shipOwnersDebit = 0;
        _merchantsCredit = 0;
        const boxesTransaction = nextBoxesTransactions[key];
        if (boxesTransaction.merchantId)
            _merchantsCredit = boxesTransaction.credit || 0;
        else if (boxesTransaction.shipOwnerId)
            _shipOwnersDebit = boxesTransaction.debit || 0;
        boxesTransaction.stock = previousStock + _merchantsCredit - _shipOwnersDebit
        previousStock = boxesTransaction.stock;
        await boxesTransaction.save();
    }
}

module.exports = router;

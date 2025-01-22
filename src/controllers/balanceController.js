var router = require('express').Router();
const dao = require("../dao/balanceDao");
const { Op } = require('sequelize');
const beneficiaryDao = require("../dao/beneficiaryDao");
const saleDao = require("../dao/saleDao");
const salePaymentDao = require("../dao/salePaymentDao");
const commissionBeneficiaryController = require("../controllers/commissionBeneficiaryController");
const Response = require("../utils/response");
const {
    Sale,
    SalesTransaction,
    sequelize,
    BeneficiaryBalance,
    CommissionValue,
    Beneficiary,
    Payment, SalePayment, Shipowner, Merchant
} = require("../models");
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const salesTransactionDao = require("../dao/salesTransactionDao");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving balance :', error);
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
        console.error('Error retrieving balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const balance = req.body;
    try {
        if (!_.isNumber(balance.credit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!_.isNumber(balance.debit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        balance.balance = Number(parseFloat(balance.credit - balance.debit).toFixed(3));
        const created = await dao.create(balance);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const balance = req.body;
    try {
        if (!_.isNumber(balance.credit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!_.isNumber(balance.debit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        balance.balance = Number(parseFloat(balance.credit - balance.debit).toFixed(3));
        const updated = await dao.update(balance);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.updateByShipOwnerAsProducer = async function (shipOwnerId, date = new Date()) {
    // console.log("=====================>updateByShipOwnerAsProducer : " + JSON.stringify(shipOwnerId));
    let balance = await dao.find({where: {shipOwnerId: shipOwnerId}});
    if (!balance || !balance.length)
        balance = await dao.create({
            credit: 0,
            debit: 0,
            producerCommission: 0,
            merchantCommission: 0,
            balance: 0,
            shipOwnerId: shipOwnerId
        });
    else
        balance = balance[0];
    let result = await Sale.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('totalToPay')), 'totalToPay'],
            [sequelize.fn('sum', sequelize.col('totalProducerCommission')), 'totalProducerCommission'],
        ],
        raw: true,
        where: {shipOwnerId: shipOwnerId}
    });
    // console.log("=====================>balance before update : " + JSON.stringify(balance));
    const totalToPay = Number(parseFloat((result && result.length) ? (result[0]["totalToPay"] || 0) : 0).toFixed(3));
    const totalProducerCommission = Number(parseFloat((result && result.length) ? (result[0]["totalProducerCommission"] || 0) : 0).toFixed(3));
    balance.credit = totalToPay;
    balance.producerCommission = totalProducerCommission;
    let salesIds = await Sale.findAll({
        attributes: ['id'],
        where: {shipOwnerId: shipOwnerId}
    });
    const totalPaymentsAmount = await SalePayment.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('value')), 'value']
        ],
        raw: true,
        where: {saleId: _.keys(_.keyBy(salesIds, 'id')).map(Number)}
    });
    const totalPayments = (totalPaymentsAmount && totalPaymentsAmount.length) ? (totalPaymentsAmount[0]["value"] || 0) : 0;
    // console.log("=====================>totalPayments : " + JSON.stringify(totalPayments));
    balance.debit = totalPayments;
    balance.balance = Number(parseFloat(balance.credit - (balance.debit || 0)).toFixed(3));
    // console.log("=====================>balance to update : " + JSON.stringify(balance));
    const updated = await dao.update(balance);
    // await router.updateBeneficiaryCommissionsBalance(date);
    return updated;
}

router.updateMerchantBalance = async function (merchantId, date = new Date()) {
    let balance = await dao.find({where: {merchantId: merchantId}});
    if (!balance || !balance.length)
        balance = await dao.create({
            credit: 0,
            debit: 0,
            producerCommission: 0,
            merchantCommission: 0,
            balance: 0,
            merchantId: merchantId
        });
    else
        balance = balance[0];
    const totalSalesAmount = await Sale.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('totalToPay')), 'totalToPay'],
            [sequelize.fn('sum', sequelize.col('totalProducerCommission')), 'totalProducerCommission'],
        ],
        raw: true,
        where: {merchantId: merchantId}
    });
    const totalToPay = Number(parseFloat((totalSalesAmount && totalSalesAmount.length) ? (totalSalesAmount[0]["totalToPay"] || 0) : 0).toFixed(3));
    const totalProducerCommission = Number(parseFloat((totalSalesAmount && totalSalesAmount.length) ? (totalSalesAmount[0]["totalProducerCommission"] || 0) : 0).toFixed(3));
    balance.credit = totalToPay;
    balance.producerCommission = totalProducerCommission;
    const totalPaymentsAmount = await Payment.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('value')), 'value']
        ],
        raw: true,
        where: {merchantId: merchantId, isCommissionnaryPayment: false}
    });
    const totalPayments = (totalPaymentsAmount && totalPaymentsAmount.length) ? (totalPaymentsAmount[0]["value"] || 0) : 0;
    balance.credit += totalPayments;
    const totalPurchasesAmount = await SalesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('totalPrice')), 'totalPrice'],
            [sequelize.fn('sum', sequelize.col('merchantCommission')), 'merchantCommission'],
        ],
        raw: true,
        where: {merchantId: merchantId}
    });
    const totalPurchasesPrice = Number(parseFloat((totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["totalPrice"] || 0) : 0).toFixed(3));
    const totalMerchantCommissions = Number(parseFloat((totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["merchantCommission"] || 0) : 0).toFixed(3));
    // console.log("=====================>totalPurchasesPrice : " + JSON.stringify(totalPurchasesPrice));
    balance.debit = Number(parseFloat(totalPurchasesPrice + totalMerchantCommissions).toFixed(3));
    balance.merchantCommission = totalMerchantCommissions;
    balance.balance = Number(parseFloat((balance.credit || 0) - (balance.debit || 0)).toFixed(3));
    const updated = await dao.update(balance);
    // await router.updateBeneficiaryCommissionsBalance(date);
    return updated;
}

// router.updateByMerchantAsCustomer = async function (merchantId, date = new Date()) {
//     // console.log("=====================>updateByMerchantAsCustomer : " + JSON.stringify(date));
//     let balance = await dao.find({where: {merchantId: merchantId}});
//     if (!balance || !balance.length)
//         balance = await dao.create({
//             credit: 0,
//             debit: 0,
//             balance: 0,
//             merchantId: merchantId
//         });
//     else
//         balance = balance[0];
//     const totalPurchasesAmount = await SalesTransaction.findAll({
//         attributes: [
//             [sequelize.fn('sum', sequelize.col('totalPrice')), 'totalPrice'],
//             [sequelize.fn('sum', sequelize.col('merchantCommission')), 'merchantCommission'],
//         ],
//         raw: true,
//         where: {merchantId: merchantId}
//     });
//     const totalPrice = (totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["totalPrice"] || 0) : 0;
//     const totalCommissions = (totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["merchantCommission"] || 0) : 0;
//     // console.log("=====================>totalPrice : " + JSON.stringify(totalPrice));
//     balance.debit = totalPrice + totalCommissions;
//     balance.merchantCommission = totalCommissions;
//     //TODO : calculate total debit when managing payments
//     balance.balance = (balance.credit || 0) - balance.debit;
//     const updated = await dao.update(balance);
//     // await router.updateBeneficiaryCommissionsBalance(date);
//     return updated;
// }

router.updateBeneficiaryCommissionsBalance = async function (date) {
    const beneficiaries = await beneficiaryDao.list();
    let beneficiaryBalances = [];
    for (let i in beneficiaries) {
        const beneficiary = beneficiaries[i];
        let balance = await BeneficiaryBalance.findAll({where: {beneficiaryId: beneficiary.id}});
        if (!balance || !balance.length) {
            const transaction = await sequelize.transaction();
            balance = await BeneficiaryBalance.create({
                credit: 0,
                debit: 0,
                producerCommission: 0,
                merchantCommission: 0,
                balance: 0,
                beneficiaryId: beneficiary.id
            }, {transaction});
            await transaction.commit();
        } else
            balance = balance[0];
        beneficiaryBalances.push(balance);
    }
    const beneficiaryBalancesById = _.groupBy(beneficiaryBalances, 'beneficiaryId');
    const commissionController = require("../controllers/commissionController");
    const availableCommissions = await commissionController.getAvailableCommissionsAtDate(date);
    const availableCommissionBeneficiaries = await commissionBeneficiaryController.getAvailableCommissionBeneficiariesAtDate(date);
    for (let i in beneficiaries) {
        const beneficiary = beneficiaries[i];
        let beneficiaryBalance = beneficiaryBalancesById[beneficiary.id];
        const beneficiaryCommissions = _.filter(availableCommissionBeneficiaries, function (item) {
            return item.beneficiaryId == beneficiary.id;
        });
        const beneficiaryCommissionIds = _.keys(_.keyBy(beneficiaryCommissions, 'commissionId')).map(Number);
        const beneficiaryProducerCommissionsIds = _.keys(_.keyBy(_.filter(availableCommissions, function (item) {
            return beneficiaryCommissionIds.includes(item.commissionId) && item.isSellerCommission;
        }), 'Commission.id')).map(Number)
        let totalProducerCommissions = await CommissionValue.findAll({
            attributes: [
                [sequelize.fn('sum', sequelize.col('value')), 'value']
            ],
            raw: true,
            where: {commissionId: beneficiaryProducerCommissionsIds}
        });
        const beneficiaryCustomerCommissionsIds = _.keys(_.keyBy(_.filter(availableCommissions, function (item) {
            return beneficiaryCommissionIds.includes(item.commissionId) && item.isCustomerCommission;
        }), 'Commission.id')).map(Number)
        let totalCustomerCommissions = await CommissionValue.findAll({
            attributes: [
                [sequelize.fn('sum', sequelize.col('value')), 'value']
            ],
            raw: true,
            where: {commissionId: beneficiaryCustomerCommissionsIds}
        });
        totalProducerCommissions = (totalProducerCommissions && totalProducerCommissions.length) ? (totalProducerCommissions[0]["value"] || 0) : 0;
        totalCustomerCommissions = (totalCustomerCommissions && totalCustomerCommissions.length) ? (totalCustomerCommissions[0]["value"] || 0) : 0;
        beneficiaryBalance.producerCommission = totalProducerCommissions;
        beneficiaryBalance.merchantCommission = totalCustomerCommissions;
        beneficiaryBalance.credit = Number(parseFloat(totalProducerCommissions + totalCustomerCommissions).toFixed(3));
        beneficiaryBalance.balance = Number(parseFloat(beneficiaryBalance.credit - (beneficiaryBalance.debit || 0)).toFixed(3));

        const oldBeneficiaryBalance = await BeneficiaryBalance.findOne({where: {beneficiaryId: beneficiary.id}});
        if (!oldBeneficiaryBalance) {
            console.error('beneficiary not found error');
            return null;
        }
        try {
            _.assign(oldBeneficiaryBalance, beneficiaryBalance);
            await oldBeneficiaryBalance.save();
            // return oldBeneficiaryBalance;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    }
}
/**********SoldeArmateur************/

router.post('/generateReportSoldeProducteur',async (req, res) => {

    console.log("Nom de la session:", req.sessionStore);
    try
    {
        const dataToReport = await router.getSoldeProducteurReportData(req.body);
        const { creditType, debitType } = req.body;
        if (creditType || debitType) {
            router.generatePDFSoldeProducteurReport(dataToReport,req.body, res);
        } else{
            // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
            res.status(200).json({
                message: 'Report data fetched successfully',
                data: dataToReport,
            });
        }
    }catch (error){
        console.error('Error generating solde Producteur report:', error);

        res.status(500).json({ error: 'Error generating report' });
    }
});

router.getSoldeProducteurReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.soldeRule) && !tools.isFalsey(options.solde1)) {
        soldeValue=options.solde1;
        switch (options.soldeRule) {
            case 'equals' : {
                console.log("Solde value:", soldeValue );
                criteria.where = {
                    [Op.or]: [
                        { credit: soldeValue },
                        { debit: soldeValue }
                    ]
                };
                break;
            }
            case 'notEquals' : {
                criteria.where = {
                    [Op.and]: [
                        { credit: { [Op.ne]: soldeValue } },
                        { debit: { [Op.ne]: soldeValue } }
                    ]
                }
                break;
            }
            case 'lowerThan' : {
                criteria.where = {
                    [Op.or]: [
                        { credit: { [Op.lte]: soldeValue } },
                        { debit: { [Op.lte]: soldeValue } }
                    ]
                };
                break;
            }
            case 'greaterThan' : {
                criteria.where = {
                    [Op.or]: [
                        { credit: { [Op.gte]: soldeValue } },
                        { debit: { [Op.gte]: soldeValue } }
                    ]
                };
                break;
            }
            case 'between' : {
                if (!tools.isFalsey(options.solde2)) {
                    const solde2 = options.solde2;
                    // La valeur doit être entre les deux bornes pour `credit` OU `debit`
                    criteria.where = {
                        [Op.or]: [
                            {
                                credit: {
                                    [Op.between]: [Math.min(soldeValue, solde2), Math.max(soldeValue, solde2)]
                                }
                            },
                            {
                                debit: {
                                    [Op.between]: [Math.min(soldeValue, solde2), Math.max(soldeValue, solde2)]
                                }
                            }
                        ]
                    };
                }
                break;
            }
            default:
                break;
        }
    }

    if (!tools.isFalsey(options.producer))
        criteria.where.shipOwnerId = options.producer;

    let balances= await dao.find(criteria);
    return balances;
}


router.generateReportProducteurTitle = async function (filter) {
    const {producer, solde1, solde2, soldeRule} = filter;
    console.log("filter:",filter);
    let title = 'Soldes Des Armateurs';
    let reportTitle = [];
    let solde = '';
    let producerName = '';
    if (producer) {
        const producerData = await Shipowner.findByPk(producer);
        if(producerData){
            title = `Solde du Armateur : ${producerData.name.toUpperCase()}`;
            producerName = producerData.name;
        }
    }

    switch (soldeRule) {
        case 'equals':
            solde = solde1 ? `Solde exact : ${solde1}` : 'solde exacte non spécifiée';
            break;
        case 'notEquals':
            solde = solde1 ? `Autre que : ${solde1}` : 'solde à exclure non spécifiée';
            break;
        case 'lowerThan':
            solde = solde1 ? `Solde inférieur à : ${solde1}` : 'Solde limite non spécifiée';
            break;
        case 'greaterThan':
            solde = solde1 ? `Solde Supérieur à : ${solde1}` : 'Solde de départ non spécifiée';
            break;
        case 'between':
            const formattedStart = solde1 ? solde1 : null;
            const formattedEnd = solde2 ? solde2 : null;
            solde = formattedStart && formattedEnd ? `Entre : ${formattedStart} et ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            solde = '';
    }

    reportTitle.push(title);

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} \n par :`;

    return {
        title, reportTitle: reportTitle.join('\n'), solde, generationDate,
    };
}

router.generatePDFSoldeProducteurReport = async function (data, filter, res) {
    const {title, reportTitle, solde, generationDate} = await router.generateReportProducteurTitle (filter);
    const { creditType, debitType } = filter;
    let titleRowC = [];
    let titleRowD = [];
    titleRowC.push([
        {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Solde', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}]
    );
    titleRowD.push([
        {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Solde ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}]
    );

    let creditReportData = [];
    let debitReportData = [];
    let totalCreditSolde =0;
    let totalDebitSolde =0;
    for (const balance of data) {
        if (balance.shipOwner && balance.shipOwner.name) {
            if (balance.credit > 0) {
                totalCreditSolde += balance.credit;
                creditReportData.push([
                    {
                        text: balance.shipOwner?.name?.toUpperCase() || '',
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.credit, fontSize: 9, alignment: 'center', margin: [0, 3]}
                ]);
            }
            if (balance.debit > 0) {
                totalDebitSolde += balance.debit;
                debitReportData.push([

                    {
                        text: balance.shipOwner?.name.toUpperCase() || 'Non spécifié',
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.debit, fontSize: 9, alignment: 'center', margin: [0, 3]}
                ]);
            }
        }
    }


    debitReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true, margin: [0, 3]},
        {text: totalDebitSolde.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 9, alignment: 'center', bold: true, margin: [0, 3]},
    ]);
    creditReportData.push([
        {
            text: 'Total',
            fontSize: 10,
            alignment: 'center',
            bold: true,
            margin: [0, 3],
        },
        {
            text: totalCreditSolde.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }),
            fontSize: 9,
            alignment: 'center',
            bold: true,
            margin: [0, 3],
        },
    ]);
    let pdfContent = [
        { text: reportTitle, fontSize: 14, alignment: 'center', decoration: 'underline', font: 'Roboto', bold: true, margin: [0, 10] },
        { text: solde, fontSize: 14, alignment: 'center', margin: [0, 6] },
        { text: generationDate, fontSize: 10, alignment: 'right', margin: [0, 0, 0, 10] }
    ];
    if (creditType) {
        pdfContent.push(
            {text: ' Liste des Armateurs Créditeurs ', fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
            {
                columns: [{
                    table: {
                        body: [...titleRowC, ...creditReportData],
                        widths: ['*', '*'],
                    },
                },],
            },
        );
    }


    if (debitType) {
        if (creditType) {
            pdfContent.push({text: '', pageBreak: 'after'});
        }
        pdfContent.push(
            {text: ' Liste des Armateurs Débiteurs ', fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
            {
                columns: [{
                    table: {
                        body: [...titleRowD, ...debitReportData],
                        widths: ['*', '*'],
                    },
                },],
            },
        );
    }

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: pdfContent,

        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: ` Page ${currentPage} / ${pageCount}`,
                        alignment: 'right',
                        margin: [0, 0, 40, 80],
                        fontSize: 10
                    },
                ],
            };
        },
    };

// var PdfPrinter = require('pdfmake');
    var fonts = {
        Roboto: {
            normal: './assets/fonts/roboto/Roboto-Regular.ttf',
            bold: './assets/fonts/roboto/Roboto-Bold.ttf',
            italics: './assets/fonts/roboto/Roboto-Italic.ttf',
            bolditalics: './assets/fonts/roboto/Roboto-BoldItalic.ttf'
        }
    };

    var PdfPrinter = require('pdfmake/src/printer');
    var printer = new PdfPrinter(fonts);
    var fs = require('fs');
    var options = {
        // ...
    };

    fileName = "SoldeArmateur.pdf";
    await tools.cleanTempDirectory(fs, path);
    try {
        var pdfDoc = printer.createPdfKitDocument(docDefinition, options);
        pdfDoc.pipe(fs.createWriteStream(tools.PDF_PATH + fileName)).on('finish', function () {
            res.status(201).json(new Response(fileName, path));
        });
        pdfDoc.end();
    } catch (err) {
        console.log("=====================>err : " + JSON.stringify(err));
        res.status(404).json(new Response(err, true));
    }
}



/**********SoldeCommercant************/

router.post('/generateReportSoldeCommercant', async (req, res) => {

    try
    {
        const dataToReport = await router.getSoldeReportData(req.body);
        const { creditType, debitType } = req.body;
        if (creditType || debitType) {
            router.generatePDFSoldeReport(dataToReport,req.body, res);
        } else{
            // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
            res.status(200).json({
                message: 'Report data fetched successfully',
                data: dataToReport
            });
        }
    }catch (error){
        console.error('Error generating solde report:', error);

        res.status(500).json({ error: 'Error generating report' });
    }
});

router.getSoldeReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.soldeRule) && !tools.isFalsey(options.solde1)) {
      soldeValue=options.solde1;
        switch (options.soldeRule) {
            case 'equals' : {
                    criteria.where = {
                        [Op.or]: [
                            { credit: soldeValue },
                            { debit: soldeValue }
                        ]
                    };
            break;
            }
            case 'notEquals' : {
                criteria.where = {
                    [Op.and]: [
                        { credit: { [Op.ne]: soldeValue } },
                        { debit: { [Op.ne]: soldeValue } }
                    ]
                }
             break;
            }
            case 'lowerThan' : {
                criteria.where = {
                    [Op.or]: [
                        { credit: { [Op.lte]: soldeValue } },
                        { debit: { [Op.lte]: soldeValue } }
                    ]
                };
                break;
            }
            case 'greaterThan' : {
                criteria.where = {
                    [Op.or]: [
                        { credit: { [Op.gte]: soldeValue } },
                        { debit: { [Op.gte]: soldeValue } }
                    ]
                };
             break;
            }
            case 'between' : {
                if (!tools.isFalsey(options.solde2)) {
                    const solde2 = options.solde2;
                    // La valeur doit être entre les deux bornes pour `credit` OU `debit`
                    criteria.where = {
                        [Op.or]: [
                            {
                                credit: {
                                    [Op.between]: [Math.min(soldeValue, solde2), Math.max(soldeValue, solde2)]
                                }
                            },
                            {
                                debit: {
                                    [Op.between]: [Math.min(soldeValue, solde2), Math.max(soldeValue, solde2)]
                                }
                            }
                        ]
                    };
                }
                break;
            }
            default:
                break;
        }
    }
     if (!tools.isFalsey(options.merchant))
            criteria.where.merchantId = options.merchant;

        let balances= await dao.find(criteria);
    return balances;
}


router.generateReportTitle = async function (filter) {
    const {merchant, solde1, solde2, soldeRule} = filter;
    let title = 'Soldes Des Clients';
    let reportTitle = [];
    let solde = '';
    let merchantName = '';

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `Solde du Client : ${merchantData.name}`;
            merchantName = merchantData.name;
        }
    }

    switch (soldeRule) {
        case 'equals':
            solde = solde1 ? `Solde exact : ${solde1}` : 'solde exacte non spécifiée';
            break;
        case 'notEquals':
            solde = solde1 ? `Autre que : ${solde1}` : 'solde à exclure non spécifiée';
            break;
        case 'lowerThan':
            solde = solde1 ? `Solde inférieur à : ${solde1}` : 'Solde limite non spécifiée';
            break;
        case 'greaterThan':
            solde = solde1 ? `Solde Supérieur à : ${solde1}` : 'Solde de départ non spécifiée';
            break;
        case 'between':
            const formattedStart = solde1 ? solde1 : null;
            const formattedEnd = solde2 ? solde2 : null;
            solde = formattedStart && formattedEnd ? `Entre : ${formattedStart} et ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            solde = '';
    }

    reportTitle.push(title);

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} 
    \n par : `;

    return {
        title, reportTitle: reportTitle.join('\n'), solde, generationDate,
    };
}

router.generatePDFSoldeReport = async function (data, filter, res) {
    const {title, reportTitle, solde, generationDate} = await router.generateReportTitle(filter);
    const { creditType, debitType } = filter;
    let titleRowC = [];
    let titleRowD = [];
    titleRowC.push([
         {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
         {text: 'Solde', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}]
);
    titleRowD.push([
        {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Solde ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}]
    );

    let creditReportData = [];
    let debitReportData = [];
    let totalCreditSolde =0;
    let totalDebitSolde =0;
    for (const balance of data) {
        if (balance.merchant && balance.merchant.name) {
            if (balance.credit > 0) {
                totalCreditSolde +=balance.credit;
                creditReportData.push([
                    {
                        text: balance.merchant?.name.toUpperCase(),
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.credit, fontSize: 9, alignment: 'center', margin: [0, 3]}
                ]);
            }
            if (balance.debit > 0) {
                totalDebitSolde+=balance.debit;
                debitReportData.push([

                    {text: balance.merchant?.name.toUpperCase() || 'Non spécifié',
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.debit, fontSize: 9, alignment: 'center', margin: [0, 3]}
                ]);
            }
        }
    }

    debitReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true, margin: [0, 3]},
        {text: totalDebitSolde.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 9, alignment: 'center', bold: true, margin: [0, 3]},
    ]);
    creditReportData.push([
        {
            text: 'Total',
            fontSize: 10,
            alignment: 'center',
            bold: true,
            margin: [0, 3],
        },
        {
            text: totalCreditSolde.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }),
            fontSize: 9,
            alignment: 'center',
            bold: true,
            margin: [0, 3],
        },
    ]);
    let pdfContent = [
        { text: reportTitle, fontSize: 14, alignment: 'center', decoration: 'underline', font: 'Roboto', bold: true, margin: [0, 10] },
        { text: solde, fontSize: 14, alignment: 'center', margin: [0, 6] },
        { text: generationDate, fontSize: 10, alignment: 'right', margin: [0, 0, 0, 10], lineHeight: 1.2 }
    ];
    if (creditType) {
        pdfContent.push(
            {text: ' Liste des Clients Créditeurs ', fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
            {
                columns: [{
                    table: {
                        body: [...titleRowC, ...creditReportData],
                        widths: ['*', '*'],
                    },
                },],
            },
        );
    }


    if (debitType) {
        if (creditType) {
            pdfContent.push({text: '', pageBreak: 'after'});
        }
        pdfContent.push(
            {text: ' Liste des Clients Débiteurs ', fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
            {
                columns: [{
                    table: {
                        body: [...titleRowD, ...debitReportData],
                        widths: ['*', '*'],
                    },
                },],
            },
        );
    }

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: pdfContent,

        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: ` Page ${currentPage} / ${pageCount}`,
                        alignment: 'right',
                        margin: [0, 0, 40, 80],
                        fontSize: 10
                    },
                ],
            };
        },
    };

// var PdfPrinter = require('pdfmake');
    var fonts = {
        Roboto: {
            normal: './assets/fonts/roboto/Roboto-Regular.ttf',
            bold: './assets/fonts/roboto/Roboto-Bold.ttf',
            italics: './assets/fonts/roboto/Roboto-Italic.ttf',
            bolditalics: './assets/fonts/roboto/Roboto-BoldItalic.ttf'
        }
    };

    var PdfPrinter = require('pdfmake/src/printer');
    var printer = new PdfPrinter(fonts);
    var fs = require('fs');
    var options = {
        // ...
    };

    fileName = "SoldeClient.pdf";
    await tools.cleanTempDirectory(fs, path);
    try {
        var pdfDoc = printer.createPdfKitDocument(docDefinition, options);
        pdfDoc.pipe(fs.createWriteStream(tools.PDF_PATH + fileName)).on('finish', function () {
            res.status(201).json(new Response(fileName, path));
        });
        pdfDoc.end();
    } catch (err) {
        console.log("=====================>err : " + JSON.stringify(err));
        res.status(404).json(new Response(err, true));
    }
}






module.exports = router;

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
const xl = require("excel4node");

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
            if (req.body.pdfType) {
                router.generatePDFSoldeProducteurReport(dataToReport, req.body, res);
            } else if (req.body.excelType) {
                router.generateExcelSoldeProducteurReport(dataToReport, req.body, res);
            } else {
                // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
                res.status(200).json({
                    message: 'Report data fetched successfully',
                    data: dataToReport,
                });
            }
        }
    }catch (error){
        console.error('Error generating solde Producteur report:', error);

        res.status(500).json({ error: 'Error generating report' });
    }
});

router.getSoldeProducteurReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.soldeRule) && !tools.isFalsey(options.solde1)) {
        switch (options.soldeRule) {
            case 'equals' : {
                criteria.where.balance= options.solde1;
                break;
            }
            case 'notEquals' : {
                criteria.where.balance = {'!': options.solde1};
                break;
            }
            case 'lowerThan' : {
                criteria.where.balance = {'<=':options.solde1};
                break;
            }
            case 'greaterThan' : {
                criteria.where.balance = {'>=':options.solde1};
                break;
            }
            case 'between' : {
                if (!tools.isFalsey(options.solde2)) {
                    criteria.where.balance = {'>=': options.solde1, '<=': options.solde2};
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
    const {producer, solde1, solde2, soldeRule,creditType, debitType} = filter;
    let title='';
    let solde = '';
    let producerName = '';
    if (producer) {
        const producerData = await Shipowner.findByPk(producer);
        if(producerData){
           title = ` Armateur : ${producerData.name.toUpperCase()}`;
            producerName = producerData.name.toUpperCase();
        }
    }
    const titles = {};
    if (creditType) {
        titles.credit = producerName
            ? `Solde de l'Armateur Créditeurs `
            : 'Solde des Armateurs Créditeurs';
    }
    if (debitType) {
        titles.debit = producerName
            ? `Solde de l'Armateur Débiteurs `
            : 'Soldes des Armateurs Débiteurs';
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

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} \n par :`;

    return {
        titles, solde , title,generationDate
    };
}

router.generatePDFSoldeProducteurReport = async function (data, filter, res) {
    const { titles, solde,title, generationDate} = await router.generateReportProducteurTitle (filter);
   // const { creditType, debitType } = filter;
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
            if (balance.balance > 0) {
                totalCreditSolde += balance.balance;
                creditReportData.push([
                    {
                        text: balance.shipOwner?.name?.toUpperCase() || '',
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.balance.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right', margin: [0, 3, 3, 3]}
                ]);
            }
            if (balance.balance < 0) {
                totalDebitSolde += balance.balance;
                debitReportData.push([
                    {
                        text: balance.shipOwner?.name.toUpperCase() || 'Non spécifié',
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.balance.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right', margin:[0, 3, 10, 3]}
                ]);
            }
        }
    }

    debitReportData.push([
        {text: 'Total', fontSize: 10, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalDebitSolde.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 9, alignment: 'right', bold: true, margin: [0, 3, 3, 3]}
    ]);
    creditReportData.push([
        {text: 'Total', fontSize: 10, alignment: 'center', bold: true, margin: [0, 3]},
        { text: totalCreditSolde.toLocaleString('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 2 }), fontSize: 9, alignment: 'right', bold: true, margin: [0, 3, 3, 3]}
    ]);
    let pdfContent = [
        { text: title, fontSize: 14, alignment: 'center', decoration: 'underline', font: 'Roboto', bold: true, margin: [0, 10] },
        { text: solde, fontSize: 14, alignment: 'center', margin: [0, 6] },
        { text: generationDate, fontSize: 10, alignment: 'right', margin: [0, 0, 0, 10] }
    ];

    if (filter.creditType && titles.credit) {
        pdfContent.push(
            {text: titles.credit, fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
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


    if (filter.debitType && titles.debit) {
        if (filter.creditType) {
            pdfContent.push({text: '', pageBreak: 'after'});
        }
         pdfContent.push(
            {text:titles.debit, fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
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
router.generateExcelSoldeProducteurReport = async function (data, filter, res) {
    try {
        const { titles, solde,title, generationDate } = await router.generateReportProducteurTitle(filter);
       const { creditType, debitType } = filter;

        const  wb = new xl.Workbook();
        const headerStyle = wb.createStyle({
            font: { bold: true, size: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0' },
            border : {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const rowStyle = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });
        const rowStyleRight = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });
        const addSheet = (sheetName, titleRow, reportData, totalSolde,titles) =>{
            const  ws = wb.addWorksheet(sheetName);

        ws.cell(1, 1, 1, 2, true).string(generationDate).style({font: {name: 'Arial', italic: true, size: 10}, alignment: {horizontal: 'right', vertical: 'center'}});
        ws.cell(2, 1, 2, 2, true).string(titles).style({font: {size: 12, bold: true}, alignment: {horizontal: 'center', vertical: 'center'}});
        ws.cell(3, 1, 3, 2, true).string(solde).style({font: {size: 12, italic: true}, alignment: {horizontal: 'center', vertical: 'center', wrapText: true}});

            titleRow.forEach((header, index) => {
                ws.cell(5, index + 1).string(header.text).style(headerStyle);
                const columnWidth = title.length + 5;
                ws.column(index + 1).setWidth(columnWidth);
            });

        ws.row(2).setHeight(40);
        ws.cell(4, 1).string('');

        reportData.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
                if (typeof cell === 'string') {
                    ws.cell(rowIndex + 6, colIndex + 1).string(cell).style(rowStyle);
                } else {
                    ws.cell(rowIndex + 6, colIndex + 1).number(parseFloat(cell)).style(rowStyleRight).style({numberFormat: "#,##0.00" });
                }
            });
        });

            ws.cell(reportData.length + 6, 1).string('Total').style(
                { font: {size: 10, bold: true}, alignment: {horizontal: 'center', vertical: 'center', wrapText: true}, border: {
                        left: { style: 'thin', color: '#000000' },
                        right: { style: 'thin', color: '#000000' },
                        top: { style: 'thin', color: '#000000' },
                        bottom: { style: 'thin', color: '#000000' }
                    }});
            ws.cell(reportData.length + 6, 2).string(totalSolde.toLocaleString("fr-TN", { style: "currency", currency: "TND", minimumFractionDigits: 2 })).style(
                { font: {size: 10, bold: true}, alignment: {horizontal: 'right', vertical: 'center', wrapText: true},    border: {
                        left: { style: 'thin', color: '#000000' },
                        right: { style: 'thin', color: '#000000' },
                        top: { style: 'thin', color: '#000000' },
                        bottom: { style: 'thin', color: '#000000' }
                    }});


        ws.column(1).setWidth(40);
        ws.column(2).setWidth(40);
    };

    let creditReportData = [];
    let debitReportData = [];
    let totalCreditSolde = 0;
    let totalDebitSolde = 0;

    for (const balance of data) {
        if (balance.shipOwner && balance.shipOwner.name) {
            const name = balance.shipOwner.name.toUpperCase();
            const balanceValue = balance.balance;
            if (balanceValue > 0) {
                totalCreditSolde += balanceValue;
                creditReportData.push([name, balanceValue]);
            } else if (balanceValue < 0) {
                totalDebitSolde += Math.abs(balanceValue);
                debitReportData.push([name, Math.abs(balanceValue)]);
            }
        }
    }

    if (creditType) {
        const titleRowC = [
            { text: 'Client', alignment: 'center' },
            { text: 'Solde', alignment: 'center' },
        ];
        addSheet('Armateurs Créditeurs', titleRowC, creditReportData, totalCreditSolde,titles.credit);
    }

    if (debitType) {
        const titleRowD = [
            { text: 'Client', alignment: 'center' },
            { text: 'Solde', alignment: 'center' },
        ];
        addSheet('Armateurs Débiteurs', titleRowD, debitReportData, totalDebitSolde,titles.debit);
    }
        const fileName = "SoldeArmateur.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        //await workbook.xlsx.writeFile(filePath);
        wb.write(filePath,function (err, stats){
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({ success: false, message: err.message });
    }

};
/**********SoldeCommercant************/
router.post('/generateReportSoldeCommercant', async (req, res) => {

    try
    {
        const dataToReport = await router.getSoldeCommercantReportData(req.body);
        const { creditType, debitType } = req.body;
        if (creditType || debitType) {
            if (req.body.pdfType) {
            router.generatePDFSoldeCommercantReport(dataToReport,req.body, res);
        } else if (req.body.excelType) {
                router.generateExcelSoldeCommercantReport(dataToReport,req.body, res);
            }
        }
            else{
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

router.getSoldeCommercantReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.soldeRule) && !tools.isFalsey(options.solde1)) {
        switch (options.soldeRule) {
            case 'equals' : {
                    criteria.where.balance= options.solde1;
            break;
            }
            case 'notEquals' : {
                criteria.where.balance = {'!': options.solde1};
             break;
            }
            case 'lowerThan' : {
                criteria.where.balance = {'<=':options.solde1};
                break;
            }
            case 'greaterThan' : {
                criteria.where.balance = {'>=':options.solde1};
             break;
            }
            case 'between' : {
                if (!tools.isFalsey(options.solde2)) {
                    criteria.where.balance = {'>=': options.solde1, '<=': options.solde2};
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


router.generateReportCommercantTitle = async function (filter) {
    const {merchant, solde1, solde2, soldeRule,creditType, debitType} = filter;
    let title = '';
    let solde = '';
    let merchantName = '';

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `Client : ${merchantData.name}`;
            merchantName = merchantData.name;
        }
    }
    const titles = {};
    if (creditType) {
        titles.credit = merchantName
            ? `Solde du Client Créditeurs `
            : 'Solde des Clients Créditeurs';
    }
    if (debitType) {
        titles.debit = merchantName
            ? `Solde du Client Débiteurs `
            : 'Soldes des Clients Débiteurs';
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


    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} \n par : `;

    return {
        titles, solde, title, generationDate,
    };
}

router.generatePDFSoldeCommercantReport = async function (data, filter, res) {
    const {titles, solde,title, generationDate} = await router.generateReportCommercantTitle(filter);
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
             if (balance.balance > 0) {
                totalCreditSolde +=balance.balance;
                creditReportData.push([
                    {
                        text: balance.merchant?.name.toUpperCase(),
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: balance.balance.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right', margin: [0, 3, 3, 3]}
                ]);
            }
            if (balance.balance < 0) {
                totalDebitSolde+=balance.balance;
                debitReportData.push([

                    {text: balance.merchant?.name.toUpperCase() || 'Non spécifié',
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    },
                    {text: Math.abs(balance.balance).toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right', margin: [0, 3, 3, 3]}
                ]);
            }
        }
    }

    debitReportData.push([
        {text: 'Total', fontSize: 10, alignment: 'center', bold: true, margin: [0, 3]},
        {text: Math.abs(totalDebitSolde).toLocaleString('fr-TN', {style: 'currency',currency: 'TND', minimumFractionDigits: 2}), fontSize: 9, alignment: 'right', bold: true, margin: [0, 3, 3, 3]}
    ]);
    creditReportData.push([
        {text: 'Total', fontSize: 10, alignment: 'center', bold: true, margin: [0, 3],},
        {text: totalCreditSolde.toLocaleString('fr-TN', { style: 'currency',currency: 'TND', minimumFractionDigits: 2 }), fontSize: 9, alignment: 'right', bold: true, margin: [0, 3, 3, 3]}
    ]);
    let pdfContent = [
        { text: title, fontSize: 14, alignment: 'center', decoration: 'underline', font: 'Roboto', bold: true, margin: [0, 10] },
        { text: solde, fontSize: 14, alignment: 'center', margin: [0, 6] },
        { text: generationDate, fontSize: 10, alignment: 'right', margin: [0, 0, 0, 10] }
    ];
    if (filter.creditType && titles.credit) {
        pdfContent.push(
            {text: titles.credit, fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
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


    if (debitType && titles.debit) {
        if (creditType) {
            pdfContent.push({text: '', pageBreak: 'after'});
        }
        pdfContent.push(
            {text:titles.debit, fontSize: 12, bold: true, alignment: 'left', margin: [0, 20]},
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

router.generateExcelSoldeCommercantReport = async function (data, filter, res) {
    try {
        const { titles, solde, generationDate } = await router.generateReportCommercantTitle(filter);
        const { creditType, debitType } = filter;

        const  wb = new xl.Workbook();
        const headerStyle = wb.createStyle({
            font: { bold: true, size: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0' },
            border : {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const rowStyle = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });
        const rowStyleRight = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });
        const addSheet = (sheetName, titleRow, reportData, totalSolde,titles) =>{
            const  ws = wb.addWorksheet(sheetName);

            ws.cell(1, 1, 1, 2, true).string(generationDate).style({font: {name: 'Arial', italic: true, size: 10}, alignment: {horizontal: 'right', vertical: 'center'}});
            ws.cell(2, 1, 2, 2, true).string(titles).style({font: {size: 12, bold: true}, alignment: {horizontal: 'center', vertical: 'center'}});
            ws.cell(3, 1, 3, 2, true).string(solde).style({font: {size: 12, italic: true}, alignment: {horizontal: 'center', vertical: 'center', wrapText: true}});

            titleRow.forEach((header, index) => {
                ws.cell(5, index + 1).string(header.text).style(headerStyle);
                const columnWidth = titles.length + 5;
                ws.column(index + 1).setWidth(columnWidth);
            });

            ws.row(2).setHeight(40);
            ws.cell(4, 1).string('');

            reportData.forEach((row, rowIndex) => {
                row.forEach((cell, colIndex) => {
                    if (typeof cell === 'string') {
                        ws.cell(rowIndex + 6, colIndex + 1).string(cell).style(rowStyle);
                    }
                    else {
                        ws.cell(rowIndex + 6, colIndex + 1).number(parseFloat(cell)).style(rowStyleRight).style({numberFormat: "#,##0.00" });
                    }
                });
            });

            ws.cell(reportData.length + 6, 1).string('Total').style(
                { font: {size: 10, bold: true}, alignment: {horizontal: 'center', vertical: 'center', wrapText: true},border: {
                        left: { style: 'thin', color: '#000000' },
                        right: { style: 'thin', color: '#000000' },
                        top: { style: 'thin', color: '#000000' },
                        bottom: { style: 'thin', color: '#000000' }
                    }});
            ws.cell(reportData.length + 6, 2).string(totalSolde.toLocaleString("fr-TN", { style: "currency", currency: "TND", minimumFractionDigits: 2 })).style(
                { font: {size: 10, bold: true}, alignment: {horizontal: 'right', vertical: 'center', wrapText: true},
                    border: {
                        left: { style: 'thin', color: '#000000' },
                        right: { style: 'thin', color: '#000000' },
                        top: { style: 'thin', color: '#000000' },
                        bottom: { style: 'thin', color: '#000000' }
                    }});


            ws.column(1).setWidth(40);
            ws.column(2).setWidth(40);
        };

        let creditReportData = [];
        let debitReportData = [];
        let totalCreditSolde = 0;
        let totalDebitSolde = 0;

        for (const balance of data) {
            if (balance.merchant && balance.merchant.name) {
                const name = balance.merchant.name.toUpperCase();
                const balanceValue = balance.balance;
                if (balanceValue > 0) {
                    totalCreditSolde += balanceValue;
                    creditReportData.push([name, balanceValue]);
                } else if (balanceValue < 0) {
                    totalDebitSolde += Math.abs(balanceValue);
                    debitReportData.push([name, Math.abs(balanceValue)]);
                }
            }
        }

        if (creditType) {
            const titleRowC = [
                { text: 'Client', alignment: 'center' },
                { text: 'Solde', alignment: 'center' },
            ];
            addSheet('Client Créditeurs', titleRowC, creditReportData, totalCreditSolde,titles.credit);
        }

        if (debitType) {
            const titleRowD = [
                { text: 'Client', alignment: 'center' },
                { text: 'Solde', alignment: 'center' },
            ];
            addSheet('Clients Débiteurs', titleRowD, debitReportData, totalDebitSolde,titles.debit);
        }


        const fileName = "SoldeClient.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        //await workbook.xlsx.writeFile(filePath);
        wb.write(filePath,function (err, stats){
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({ success: false, message: err.message });
    }

};

module.exports = router;

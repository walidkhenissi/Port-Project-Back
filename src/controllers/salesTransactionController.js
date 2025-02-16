var router = require('express').Router();
const salesTransactionDao = require("../dao/salesTransactionDao");
const saleDao = require("../dao/saleDao");
const salesTransactionPaymentDao = require("../dao/salesTransactionPaymentDao");
const paymentDao = require("../dao/paymentDao");
const balanceController = require("../controllers/balanceController");
const boxesTransactionController = require("../controllers/boxesTransactionController");
const saleController = require("../controllers/saleController");
const commissionController = require("../controllers/commissionController");
const Response = require("../utils/response");
const {CommissionValue, Merchant, PaymentInfo, Article, Sale, SalesTransaction, Payment} = require("../models");
const fs = require("fs");
const path = require("path");
const xl = require('excel4node');
const _ = require("lodash");
const {Op} = require("sequelize");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await salesTransactionDao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const whereCriteria1 = _.clone(criteria.where);
        const data = await salesTransactionDao.find(criteria);
        const count = await salesTransactionDao.count({where: whereCriteria});
        const sum = await salesTransactionDao.sum({where: {id: _.map(data, 'id')}});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        response.metaData.sum = sum;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await salesTransactionDao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    let salesTransaction = req.body;
    let sale;
    try {
        try {
            salesTransaction = await router.checkDataConstraints(salesTransaction);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        salesTransaction = await router.checkPaymentInfo(salesTransaction);
        try {
            await router.checkRecipientNumber(salesTransaction);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        try {
            sale = await saleDao.get(salesTransaction.saleId);
            if (!sale) return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        salesTransaction = router.calculateValues(salesTransaction);
        // console.log("=====================>salesTransaction after values calculation : " + JSON.stringify(salesTransaction));
        salesTransaction.totalMerchantPayment = 0;
        salesTransaction.totalToPayToProducer = 0;
        salesTransaction.totalToPayByMerchant = 0;
        salesTransaction.restMerchantPayment = 0;
        salesTransaction.producerCommission = 0;
        salesTransaction.merchantCommission = 0;
        salesTransaction.date = sale.date;
        if (!tools.isFalsey(sale.receiptNumber)) {
            salesTransaction.receiptNumber = sale.receiptNumber;
        }
        const transactionNumber = await salesTransactionDao.nextSaleNumber(salesTransaction);
        salesTransaction.transactionNumber = 'BL'.concat('_').concat(moment(salesTransaction.date).format('YY')).concat('_').concat(transactionNumber.toString().padStart(6, '0'));
        salesTransaction = await router.BuildSaleTransactionName(salesTransaction);
        const createdSaleTransaction = await salesTransactionDao.create(salesTransaction);
        await boxesTransactionController.persistBySalesTransaction(createdSaleTransaction);
        await commissionController.updateCommissionsBySaleTransaction(createdSaleTransaction.id);
        await balanceController.updateMerchantBalance(createdSaleTransaction.merchantId, sale.date);
        await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
        res.status(201).json(new Response(createdSaleTransaction));
    } catch (error) {
        console.error('Error creating salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    let salesTransaction = req.body;
    try {
        const oldSalesTransaction = JSON.parse(JSON.stringify(await salesTransactionDao.get(salesTransaction.id)));
        let updated;
        try {
            updated = await router.update(salesTransaction);
        } catch (err) {
            if (err.message == '#EXCEED_PAYMENT_VALUE') {
                //Undo salesTransaction update
                await router.update(oldSalesTransaction);
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            }
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        const salesTransactionPayments = await salesTransactionPaymentDao.list({where: {salesTransactionId: salesTransaction.id}});
        const affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
        // console.log("=====================>affectedPaymentsValue : " + JSON.stringify(affectedPaymentsValue));
        // console.log("=====================>updated.totalToPayByMerchant : " + JSON.stringify(updated.totalToPayByMerchant));
        if (affectedPaymentsValue > updated.totalToPayByMerchant) {
            //Undo salesTransaction update
            await router.update(oldSalesTransaction);
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        } else {
            updated.totalMerchantPayment = affectedPaymentsValue;
            updated = await router.checkPaymentInfo(updated);
            updated = await salesTransactionDao.update(updated);
        }
        return res.status(201).json(new Response(updated));
    } catch (err) {
        console.error('Error updating salesTransaction :', err.message);
        return res.status(500).json(new Response({errorCode: err.message}, true));
    }
});

router.update = async function (salesTransaction) {
    try {
        // console.log("=====================>salesTransaction : " + JSON.stringify(salesTransaction));
        salesTransaction = await router.checkDataConstraints(salesTransaction);
        // console.log("=====================>salesTransaction : " + JSON.stringify(salesTransaction));
    } catch (e) {
        throw new Error('#INTERNAL_ERROR');
        return;
    }
    try {
        await router.checkRecipientNumber(salesTransaction);
    } catch (e) {
        throw new Error('#RECIPIENT_NUMBER_ERROR');
        return;
    }
    salesTransaction = router.calculateValues(salesTransaction);
    const oldSaleTransaction = await salesTransactionDao.get(salesTransaction.id);
    //Persist salesTransaction in DB
    const updated = await salesTransactionDao.update(salesTransaction);
    await boxesTransactionController.persistBySalesTransaction(updated);
    const sale = await saleDao.get(updated.saleId);
    let updatedSaleTransaction = await commissionController.updateCommissionsBySaleTransaction(salesTransaction.id);
    await balanceController.updateMerchantBalance(oldSaleTransaction.merchantId, sale.date);
    if (oldSaleTransaction.merchantId != salesTransaction.merchantId) await balanceController.updateMerchantBalance(salesTransaction.merchantId, sale.date);
    await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
    return updatedSaleTransaction;
}

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await salesTransactionDao.get(id);
        if (!found) return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let salesTransactionPayments = await salesTransactionPaymentDao.find({where: {salesTransactionId: id}});
        if (salesTransactionPayments.length) return res.status(404).json(new Response({errorCode: '#ATTACHED_PAYMENTS'}, true));
        //Deleting salesTransation's commissionValues
        await CommissionValue.destroy({where: {salesTransactionId: id}});
        //Deleting SalesTransaction
        const removed = await salesTransactionDao.remove(id);
        await boxesTransactionController.persistBySalesTransaction(found, true);
        //Try to find the parent Sale
        const sale = await saleDao.get(found.saleId);
        await saleController.update(sale);
        await balanceController.updateMerchantBalance(found.merchantId, sale.date);
        await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.checkRecipientNumber = async function (saleTransaction) {
    // if (tools.isFalsey(saleTransaction.receiptNumber))
    //     return;
    // let criteria = {where: {receiptNumber: saleTransaction.receiptNumber}};
    // if (saleTransaction.id)
    //     criteria.where.id = {'!': saleTransaction.id};
    // const result = await salesTransactionDao.find(criteria);
    // if (result && result.length > 0) {
    //     const error = new Error('#RECIPIENT_NUMBER_ERROR');
    //     console.error(error.message);
    //     throw error;
    // }
    return;
}

router.checkDataConstraints = async function (saleTransaction) {
    let isError = false;
    if (!saleTransaction.saleId) isError = true; else if (!saleTransaction.merchantId) isError = true; else if (!saleTransaction.articleId) isError = true; else if (tools.isFalsey(saleTransaction.boxes) && tools.isFalsey(saleTransaction.grossWeight)) isError = true; else if (tools.isFalsey(saleTransaction.unitPrice)) isError = true;
    if (isError) {
        const error = new Error('Data contraints error');
        console.error(error.message);
        throw error;
    }
    saleTransaction = await router.BuildSaleTransactionName(saleTransaction);
    return saleTransaction;
}

router.BuildSaleTransactionName = async function (salesTransaction) {
    if (salesTransaction.merchantId) {
        let merchant = await Merchant.findByPk(salesTransaction.merchantId);
        if (!merchant) {
            throw new Error('SalesTransaction Owner Error! Not found merchant!');
            return;
        } else salesTransaction.name = merchant.name.concat(' | ').concat(salesTransaction.transactionNumber).concat(' | ').concat(moment(salesTransaction.date).format('YYYY-MM-DD'));
    }
    return salesTransaction;
}

router.calculateValues = function (saleTransaction) {
    if (!tools.isFalsey(saleTransaction.boxes) && _.isNumber(saleTransaction.boxes) && saleTransaction.boxes > 0 && (tools.isFalsey(saleTransaction.grossWeight) || saleTransaction.grossWeight == 0)) {
        //Product selled by box
        saleTransaction.totalPrice = Number(parseFloat(saleTransaction.boxes * saleTransaction.unitPrice).toFixed(3));
    } else if (!tools.isFalsey(saleTransaction.boxes) && _.isNumber(saleTransaction.boxes) && !tools.isFalsey(saleTransaction.grossWeight) && _.isNumber(saleTransaction.grossWeight) && saleTransaction.grossWeight > 0) {
        //Product selled by Kg in boxes
        saleTransaction.netWeight = Number(parseFloat(saleTransaction.grossWeight - (saleTransaction.subtractedWeight || 0)).toFixed(3));
        saleTransaction.totalPrice = Number(parseFloat(saleTransaction.netWeight * saleTransaction.unitPrice).toFixed(3));
    } else if ((tools.isFalsey(saleTransaction.boxes) || saleTransaction.boxes == 0) && !tools.isFalsey(saleTransaction.grossWeight) && _.isNumber(saleTransaction.grossWeight) && saleTransaction.grossWeight > 0) {
        //Product selled by Kg without boxes
        saleTransaction.netWeight = Number(parseFloat(saleTransaction.grossWeight - (saleTransaction.subtractedWeight || 0)).toFixed(3));
        saleTransaction.totalPrice = Number(parseFloat(saleTransaction.netWeight * saleTransaction.unitPrice).toFixed(3));
    }
    return saleTransaction;
}

router.checkPaymentInfo = async function (salesTransaction) {
    salesTransaction.totalToPayByMerchant = salesTransaction.totalToPayByMerchant || 0;
    if (tools.isFalsey(salesTransaction.totalMerchantPayment)) salesTransaction.totalMerchantPayment = 0;
    salesTransaction.restMerchantPayment = Number(parseFloat(salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment).toFixed(3));
    let criteriaRef;
    if (salesTransaction.totalMerchantPayment == 0) {
        criteriaRef = {reference: 'NOT_PAYED'};
    } else if (salesTransaction.restMerchantPayment == 0) {
        criteriaRef = {reference: 'PAYED'};
    } else {
        criteriaRef = {reference: 'PARTIALLY_PAYED'};
    }
    // console.log("=====================>salesTransaction : " + JSON.stringify(salesTransaction));
    const paymentInfo = await PaymentInfo.findOne({where: criteriaRef});
    if (!paymentInfo) {
        throw new Error('No payment Info definition Error');
        return;
    }
    salesTransaction.paymentInfoId = paymentInfo.id;
    return salesTransaction;
}
/**************************************/
router.post('/generateSalesTransactionReport', async (req, res) => {
    // const {startDate, endDate, merchant, article} = req.body;
    //console.log("valeur de request:",req.session.username);
    try {
        const dataToReport = await router.getSalesTransactionReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelSalesTransactionReport(dataToReport, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFSalesTransactionReport(dataToReport, req.body, res, username);
        } else {
            // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
            res.status(200).json({
                message: 'Report data fetched successfully', data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating transaction  report:', error);

        res.status(500).json({error: 'Error generating report'});
    }
});

router.getSalesTransactionReportData = async function (options) {
    let criteria = {where: {}};

    if (!tools.isFalsey(options.dateRule)) {
        switch (options.dateRule) {
            case 'equals' : {
                const startOfDay = new Date(options.startDate).setHours(0, 0, 0, 0);
                const endOfDay = new Date(options.startDate).setHours(23, 59, 59, 999);
                criteria.where.date = {'>=': startOfDay, '<=': endOfDay};
                break;
            }
            case 'notEquals' : {
                criteria.where.date = {'!': options.startDate};
                break;
            }
            case 'lowerThan' : {
                criteria.where.date = {'<=': options.startDate};
                break;
            }
            case 'greaterThan' : {
                criteria.where.date = {'>=': options.startDate};
                break;
            }
            case 'between' : {
                criteria.where.date = {'>=': options.startDate, '<=': options.endDate};
                break;
            }
            default:
                break;
        }
    }
    if (!tools.isFalsey(options.merchant)) criteria.where.merchantId = options.merchant;
    if (!tools.isFalsey(options.article)) criteria.where.articleId = options.article;
    if (!tools.isFalsey(options.saleId)) {
        criteria.where.saleId = options.saleId;

    }
    let transasctions = await salesTransactionDao.findAll(criteria);

    return transasctions;

}
router.generateReportTitle = async function (filter, username) {
    const {merchant, article, startDate, endDate, dateRule} = filter;
    let title = 'Liste Des Achats Des Commerçants';
    let reportTitle = [];
    let period = '';
    let articleName = '';
    let merchantName = '';

    if (article) {
        const articleData = await Article.findByPk(article);
        articleName = articleData ? `Pour L' Article : ${articleData.name.toUpperCase()}` : '';
    }

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `Liste Des Achats \n Du Commerçant : ${merchantData.name.toUpperCase()}`;
            merchantName = merchantData.name;
        }
    }

    switch (dateRule) {
        case 'equals':
            period = startDate ? `Le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date exacte non spécifiée';
            break;
        case 'notEquals':
            period = startDate ? `Autre que : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date à exclure non spécifiée';
            break;
        case 'lowerThan':
            period = startDate ? `Avant le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date limite non spécifiée';
            break;
        case 'greaterThan':
            period = startDate ? `Après le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date de début non spécifiée';
            break;
        case 'between':
            const formattedStart = startDate ? new Date(startDate).toLocaleDateString('fr-TN') : null;
            const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('fr-TN') : null;
            period = formattedStart && formattedEnd ? `Du : ${formattedStart} Au ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            period = '';
    }

    reportTitle.push(title);
    if (articleName) reportTitle.push(articleName);

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, reportTitle: reportTitle.join('\n'), period, generationDate,
    };
}

router.generatePDFSalesTransactionReport = async function (data, filter, res, username) {
    const {title, reportTitle, period, generationDate} = await router.generateReportTitle(filter, username);
    let titleRow = [];
    titleRow.push([
        !filter.merchant ? {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'} : null,
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Producteur', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        !filter.article ? {text: 'Article', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'} : null,
        {text: 'N° Bon de vente', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Quitt.', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Quant.', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Poid Net', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Unit.', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Sous Total', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Commission', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Total', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}].filter(Boolean));
    const filteredData = data.filter(transaction => {
        if (!filter.merchant && !filter.article) return true;

        return (!filter.merchant || transaction.merchant?.id === filter.merchant) &&
            (!filter.article || transaction.article?.id === filter.article);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    let salesReportData = [];
    let totalPriceSum = 0;
    let totalQuantitySum = 0;
    let totalWeightSum = 0;
    let subTotalPriceSum = 0;
    let totalCommissionSum = 0;


    const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
    Object.keys(groupedByMerchant).forEach(merchant => {
        const merchantGroup = groupedByMerchant[merchant];
        const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
            Object.keys(groupedByProducer).forEach(producer => {
                const producerGroup = groupedByProducer[producer];
                const groupedByArticle = _.groupBy(producerGroup, item => item.article?.name);
                Object.keys(groupedByArticle).forEach(article => {
                    const articleGroup = groupedByArticle[article];

                    let isFirstRow = true;
                    const calculateMargin = (rowSpan, lineHeight = 2.5, fontSize = 9) => {
                        if (rowSpan == 1)
                            return [0, 0, 0, 0];
                        const totalRowHeight = rowSpan * fontSize * lineHeight; // Hauteur totale pour les lignes fusionnées
                        const cellHeight = fontSize; // Hauteur du texte dans la cellule
                        const verticalMargin = (totalRowHeight - cellHeight) / 2; // Centrage vertical
                        return [0, verticalMargin, 0, verticalMargin];
                    };
                    articleGroup.forEach((transaction, index) => {
                        totalQuantitySum += transaction.boxes;
                        totalWeightSum += transaction.netWeight;
                        subTotalPriceSum += transaction.totalPrice;
                        totalCommissionSum += transaction.merchantCommission;
                        totalPriceSum += transaction.totalToPayByMerchant;

                        const row = [
                            !filter.merchant ? (isFirstRow ? {
                                text: transaction.merchant?.name.toUpperCase() || "Non spécifié",
                                rowSpan: merchantGroup.length,
                                fontSize: 9,
                                alignment: 'center',
                                margin: calculateMargin(merchantGroup.length)
                            } : null) : null,
                            isFirstRow ? {
                                text: moment(transaction.date).format('DD-MM-YYYY'),
                                rowSpan: dateGroup.length,
                                fontSize: 9,
                                alignment: 'center',
                                margin: calculateMargin(dateGroup.length)
                            } : null,
                            isFirstRow ? {
                                text: transaction.sale.producerName.toUpperCase(),
                                rowSpan: producerGroup.length,
                                fontSize: 9,
                                alignment: 'center',
                                margin: calculateMargin(producerGroup.length)
                            } : null,

                            !filter.article ? (isFirstRow ? {
                                text: transaction.article?.name || "Non spécifié",
                                rowSpan: articleGroup.length,
                                fontSize: 9,
                                alignment: 'center',
                                margin: calculateMargin(articleGroup.length)
                            } : null) : null,
                            {text: transaction.receiptNumber, fontSize: 9, alignment: 'center', margin: [0, 3]},
                            {text: transaction.quittance, fontSize: 9, alignment: 'center', margin: [0, 3]},
                            {text: transaction.boxes, fontSize: 9, alignment: 'center', margin: [0, 3]},
                            {text: transaction.netWeight, fontSize: 9, alignment: 'center', margin: [0, 3]},
                            {
                                text: transaction.unitPrice.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 9, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: transaction.totalPrice.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 9, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: transaction.merchantCommission.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 9, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: transaction.totalToPayByMerchant.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 9, alignment: 'right', margin: [0, 3]
                            }
                        ].filter(Boolean);
                        salesReportData.push(row);
                    });
                });
            });
        });
    });
    salesReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true, colSpan: 4 - (filter.article ? 1 : 0) - (filter.merchant ? 1 : 0), margin: [0, 3]
    },
        '',
        ...(filter.merchant ? [] : ['']),
        ...(filter.article ? [] : ['']),
        '',
        '',
        {text: totalQuantitySum, fontSize: 9, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalWeightSum, fontSize: 9, alignment: 'center', bold: true, margin: [0, 3]},
        '',
        {
            text: subTotalPriceSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }),
            fontSize: 9,
            alignment: 'right',
            bold: true,
            margin: [0, 3]
        },
        {
            text: totalCommissionSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }),
            fontSize: 9,
            alignment: 'right',
            bold: true,
            margin: [0, 3]
        },
        {
            text: totalPriceSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}),
            fontSize: 9,
            alignment: 'right',
            bold: true,
            margin: [0, 3]
        }
    ]);

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'landscape',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: [
            {
                text: reportTitle,
                fontSize: 14,
                alignment: 'center',
                decoration: 'underline',
                font: 'Roboto',
                bold: true,
                margin: [0, 20, 0, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            {text: generationDate, fontSize: 10, alignment: 'right'},
            ' \n',

            {
                columns: [{

                    table: {
                        headerRows: 1,
                        body: [...titleRow, ...salesReportData],
                        widths: ['auto', 55, !filter.merchant ? 'auto' : 0, !filter.article ? 70 : 0, '*', 30, 30, 30, '*', '*', '*', '*'].filter(Boolean),
                    },
                },],
            },],
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
    fileName = "achatClient.pdf";
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

router.generateExcelSalesTransactionReport = async function (data, filter, res, username) {
    try {
        const {title, reportTitle, period, generationDate} = await router.generateReportTitle(filter, username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const titleRow = [(!filter.merchant ? 'Client' : ''), 'Date', 'Producteur', (!filter.article ? 'Article' : ''), 'N° Bon de vente ', 'Quittance', 'Quantite', 'Poid Net', 'Prix Unit.', 'Sous Total', 'Commission', 'Total'].filter(Boolean);

        ws.cell(1, 1, 1, titleRow.length, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(reportTitle)
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, titleRow.length, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(70);
        ws.cell(4, 1).string('');

        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const tableWidth = 100;
        const columnCount = titleRow.length;
        const columnWidth = Math.floor(tableWidth / columnCount);
        titleRow.forEach((title, index) => {
            ws.cell(5, index + 1).string(title).style(headerStyle);
            ws.column(index + 1).setWidth(columnWidth);
        });
        const rowStyle = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'center', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });
        const rowStyleRight = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'right', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });

        let rowIndex = 6;
        const filteredData = data.filter(transaction => {
            return (!filter.merchant || transaction.merchant?.id === filter.merchant) &&
                (!filter.article || transaction.article?.id === filter.article);
        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        let numberFormat = {numberFormat: '#,##0.00; (#,##0.00); -'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let currencyFormatStyle = {numberFormat: '_-* # ##0.00\\ [$TND]_-;-* # ##0.00\\ [$TND]_-;_-* "-"??\\ [$TND]_-;_-@_-'};
        let subTotalPriceSum = 0;
        let totalQuantitySum = 0;
        let totalWeightSum = 0;
        let totalCommissionSum = 0;
        let totalPriceSum = 0;
        const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
        Object.keys(groupedByMerchant).forEach(merchant => {
            let isFirstMerchantRow = true;
            const merchantGroup = groupedByMerchant[merchant];
            const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
                const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
                let isFirstDateRow = true;
                Object.keys(groupedByProducer).forEach(producer => {
                    const producerGroup = groupedByProducer[producer];
                    const groupedByArticle = _.groupBy(producerGroup, item => item.article?.name);
                    let isFirstProducerRow = true;
                    Object.keys(groupedByArticle).forEach(article => {
                        const articleGroup = groupedByArticle[article];
                        articleGroup.forEach((transaction, index) => {
                            totalQuantitySum += transaction.boxes || 0;
                            totalWeightSum += transaction.netWeight || 0;
                            subTotalPriceSum += transaction.totalPrice || 0;
                            totalCommissionSum += transaction.merchantCommission || 0;
                            totalPriceSum += transaction.totalToPayByMerchant || 0;
                            if (!filter.merchant) {
                                if (isFirstMerchantRow) {
                                    ws.cell(rowIndex, 1, rowIndex + merchantGroup.length - 1, 1, true).string(transaction.merchant?.name.toUpperCase() || "Non spécifié").style(rowStyle);
                                    ws.column(1).setWidth(20);
                                    isFirstMerchantRow = false;
                                }
                            }
                            if (isFirstDateRow) {
                                ws.cell(rowIndex, filter.merchant ? 1 : 2, rowIndex + dateGroup.length - 1, filter.merchant ? 1 : 2, true)
                                    .date(transaction.date).style(dateFormatStyle)
                                    .style(rowStyle);
                                ws.column(filter.merchant ? 1 : 2).setWidth(8);
                                isFirstDateRow = false;
                            }
                            if (isFirstProducerRow) {
                                ws.cell(rowIndex, filter.merchant ? 2 : 3, rowIndex + producerGroup.length - 1, filter.merchant ? 2 : 3, true).string(transaction.sale.producerName.toUpperCase() || "Non spécifié").style(rowStyle);
                                ws.column(filter.merchant ? 2 : 3).setWidth(20);
                                isFirstProducerRow = false;
                            }
                            if (!filter.article) {
                                ws.cell(rowIndex, filter.merchant ? 3 : 4, rowIndex + articleGroup.length - 1, filter.merchant ? 3 : 4, true)
                                    .string(transaction.article?.name.toUpperCase() || "Non spécifié")
                                    .style(rowStyle);
                            }
                            let colIndex = 3;
                            if (!filter.merchant)
                                colIndex++;
                            if (!filter.article)
                                colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.receiptNumber || 0).style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(10);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(transaction.quittance || '').style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(10);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.boxes || 0).style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(7);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.netWeight || 0).style(rowStyle).style(numberFormat);
                            ws.column(colIndex).setWidth(10);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.unitPrice).style(rowStyleRight).style(numberFormat);
                            ws.column(colIndex).setWidth(9);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.totalPrice).style(rowStyleRight).style(numberFormat);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.merchantCommission).style(rowStyleRight).style(numberFormat);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.totalToPayByMerchant).style(rowStyleRight).style(numberFormat);
                            ws.column(colIndex).setWidth(15);
                            rowIndex++;
                        });
                    });
                });
            });
        });
        let totalStartCol = 1;
        let totalEndCol = 6;
        if (filter.merchant) totalEndCol -= 1;
        if (filter.article) totalEndCol -= 1;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, totalStartCol, rowIndex, totalEndCol, true).string('Total').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalQuantitySum).style(totalStyle).style(integerFormat);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalWeightSum).style(totalStyle).style(numberFormat);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).string('').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(subTotalPriceSum).style(totalStyle).style(currencyFormatStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalCommissionSum).style(totalStyle).style(currencyFormatStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalPriceSum).style(totalStyle).style(currencyFormatStyle);

        const fileName = "achatClient.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        wb.write(filePath, function (err, stats) {
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({success: false, message: err.message});
    }

};

/*****************************/
router.post('/generateAccountReport', async (req, res) => {
    // const {startDate, endDate, merchant, article} = req.body;
    try {
        const dataToReport = await router.getAccountReportData(req.body);
        // console.log("=====================>dataToReport : " + JSON.stringify(dataToReport));
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelAccountReport(dataToReport, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFAccountReport(dataToReport, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating Account report:', error);
        res.status(500).json({error: 'Error generating report'});
    }
});
router.getAccountReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.dateRule)) {
        let startOfDay = new Date(options.startDate).setHours(0, 0, 0, 0);
        let endOfDay = new Date(options.startDate).setHours(23, 59, 59, 999);
        switch (options.dateRule) {
            case 'equals' : {
                criteria.where.date = {'>=': startOfDay, '<=': endOfDay};
                break;
            }
            case 'notEquals' : {
                criteria.where.date = {'!': options.startDate};
                break;
            }
            case 'lowerThan' : {
                criteria.where.date = {'<=': endOfDay};
                break;
            }
            case 'greaterThan' : {
                criteria.where.date = {'>=': startOfDay};
                break;
            }
            case 'between' : {
                criteria.where.date = {'>=': startOfDay, '<=': new Date(options.endDate).setHours(23, 59, 59, 999)};
                break;
            }
            case 'debut':
            default:
                break;
        }
    }
    if (!tools.isFalsey(options.merchant))
        criteria.where.merchantId = options.merchant;
    if (!tools.isFalsey(options.saleId)) {
        criteria.where.saleId = options.saleId;
    }
    let cloned = _.clone(criteria.where);
    let transasctions = await salesTransactionDao.findAll(criteria);
    criteria = {where: cloned};
    criteria.where.isCommissionnaryPayment = false;
    let payments = await paymentDao.find(criteria);
    let previousBalance = 0;
    if (!tools.isFalsey(options.merchant)) {
        let refDate = _.uniq(_.map(transasctions, 'date')).reduce(function (a, b) {
            return a < b ? a : b;
        });
        refDate = new Date(refDate).setHours(0, 0, 0, 0);
        let _criteria = {where: {date: {[Op.lt]: refDate}, merchantId: options.merchant}};
        const salesSum = await SalesTransaction.sum('totalToPayByMerchant', _criteria);
        previousBalance -= salesSum;
        _criteria = {where: {date: {[Op.lt]: refDate}, merchantId: options.merchant, isCommissionnaryPayment: false}};
        const paymentsSum = await Payment.sum('value', _criteria);
        previousBalance += paymentsSum;
    }
    return {transasctions: transasctions, payments: payments, previousBalance: previousBalance};

}
router.generateReportTitleAccount = async function (filter, username) {
    const {merchant, article, startDate, endDate, dateRule} = filter;
    let title = 'Etat de compte des commerçants';
    let reportTitle = [];
    let period = '';
    let merchantName = '';

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `Etat de compte du commerçant : ${merchantData.name.toUpperCase()}`;
            merchantName = merchantData.name;
        }
    }

    switch (dateRule) {
        case 'equals':
            period = startDate ? `Le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date exacte non spécifiée';
            break;
        case 'notEquals':
            period = startDate ? `Autre que : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date à exclure non spécifiée';
            break;
        case 'lowerThan':
            period = startDate ? `Avant le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date limite non spécifiée';
            break;
        case 'greaterThan':
            period = startDate ? `Après le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date de début non spécifiée';
            break;
        case 'between':
            const formattedStart = startDate ? new Date(startDate).toLocaleDateString('fr-TN') : null;
            const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('fr-TN') : null;
            period = formattedStart && formattedEnd ? `Du : ${formattedStart} Au ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            period = '';
    }

    reportTitle.push(title);
    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, period, generationDate,
    };
}
router.generatePDFAccountReport = async function (data, filter, res, username) {
    const {title, period, generationDate} = await router.generateReportTitleAccount(filter, username);
    let titleRow = [];
    let firstTitleRow = [
        {
            text: 'Achats',
            fontSize: 10,
            colSpan: 10 - (filter.merchant ? 1 : 0),
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0'
        }
    ];
    firstTitleRow.push({}, {}, {}, {}, {}, {}, {}, {});
    if (!filter.merchant)
        firstTitleRow.push({});
    firstTitleRow.push({
            text: 'Règlements',
            fontSize: 10,
            colSpan: 3,
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0'
        },
        {}, {});
    if (filter.merchant)
        firstTitleRow.push({
            text: 'Solde',
            fontSize: 10,
            rowSpan: 2,
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0'
        });
    firstTitleRow.filter(Boolean);
    let secondTitleRow = [
        !filter.merchant ? {
            text: 'Client',
            fontSize: 9,
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0'
        } : null,
        {text: 'Date', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Producteur', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Article', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Quantite', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Poid Net', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Unit.', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Sous Total', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Commission', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Total', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Montant', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Type', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'N°Pièce', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        filter.merchant ? {text: ''} : null
    ].filter(Boolean);
    titleRow.push(firstTitleRow);
    titleRow.push(secondTitleRow);
    const filteredData = data.transasctions.filter(transaction => {
        if (!filter.merchant) return true;

        return (!filter.merchant || transaction.merchant?.id === filter.merchant);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    let salesReportData = [];
    let totalPriceSum = 0;
    let totalQuantitySum = 0;
    let totalWeightSum = 0;
    let totalToPayByMerchantSum = 0;
    let totalmerchantCommissionSum = 0;
    let totalMerchantPaymentSum = 0;
    let totalRestMerchantPaymentSum = 0;
    let columnDateHeigth = 0, paymentRowIndex = 0;
    let previousBalance = data.previousBalance;
    let balance = previousBalance;
    let payments = data.payments;
    const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
    const paymentsByMerchant = _.groupBy(payments, item => item.merchant?.name);
    Object.keys(groupedByMerchant).forEach(merchant => {
        // let isFirstMerchantRow = true;
        const merchantGroup = groupedByMerchant[merchant];
        const merchantPaymentsGroup = paymentsByMerchant[merchant];
        const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
        const groupedPaymentsByDate = _.groupBy(merchantPaymentsGroup, item => moment(item.date).format('DD-MM-YYYY'));
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const paymentsDateGroup = groupedPaymentsByDate[date];
            columnDateHeigth = Math.max(dateGroup.length - 1), (paymentsDateGroup ? (paymentsDateGroup.length - 1) : 0);
            const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
            // let isFirstDateRow = true;
            paymentRowIndex = 0;
            Object.keys(groupedByProducer).forEach(producer => {
                const producerGroup = groupedByProducer[producer];
                const groupedByArticle = _.groupBy(producerGroup, item => item.article?.name);
                // let isFirstProducerRow = true;
                Object.keys(groupedByArticle).forEach(article => {
                    const articleGroup = groupedByArticle[article];
                    let isFirstRow = true;
                    const calculateMargin = (rowSpan, lineHeight = 2, fontSize = 9) => {
                        const totalRowHeight = rowSpan * fontSize * lineHeight;
                        const cellHeight = fontSize;
                        const verticalMargin = (totalRowHeight - cellHeight) / 2;
                        return [0, verticalMargin, 0, verticalMargin];
                    };
                    articleGroup.forEach((transaction, index) => {
                        totalQuantitySum += transaction.boxes;
                        totalWeightSum += transaction.netWeight;
                        totalPriceSum += transaction.totalPrice;
                        totalmerchantCommissionSum += transaction.merchantCommission;
                        totalToPayByMerchantSum += transaction.totalToPayByMerchant;
                        totalRestMerchantPaymentSum += transaction.restMerchantPayment;
                        payment = paymentsDateGroup ? paymentsDateGroup[paymentRowIndex] : null;
                        balance = balance - transaction.totalToPayByMerchant;
                        paymentRowIndex++;
                        if (payment) {
                            totalMerchantPaymentSum += payment.value || 0;
                            balance = balance + payment.value;
                        }
                        const row = [
                            !filter.merchant ? (isFirstRow ? {
                                text: transaction.merchant?.name.toUpperCase() || "Non spécifié",
                                rowSpan: merchantGroup.length,
                                fontSize: 8,
                                alignment: 'center',
                                margin: calculateMargin(merchantGroup.length)
                            } : null) : null,
                            isFirstRow ? {
                                text: moment(transaction.date).format('DD-MM-YYYY'),
                                rowSpan: dateGroup.length,
                                fontSize: 8,
                                alignment: 'center',
                                margin: calculateMargin(dateGroup.length)
                            } : null,
                            isFirstRow ? {
                                text: transaction.sale.producerName.toUpperCase(),
                                rowSpan: producerGroup.length,
                                fontSize: 8,
                                alignment: 'center',
                                margin: calculateMargin(producerGroup.length)
                            } : null,
                            isFirstRow ? {
                                text: transaction.article?.name || "Non spécifié",
                                rowSpan: articleGroup.length,
                                fontSize: 8,
                                alignment: 'center',
                                margin: calculateMargin(articleGroup.length)
                            } : null,
                            {text: transaction.boxes, fontSize: 8, alignment: 'center', margin: [0, 3]},
                            {text: transaction.netWeight, fontSize: 8, alignment: 'center', margin: [0, 3]},
                            {
                                text: transaction.unitPrice.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 8, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: transaction.totalPrice.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 8, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: transaction.merchantCommission.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 8, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: transaction.totalToPayByMerchant.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }), fontSize: 8, alignment: 'right', margin: [0, 3]
                            },
                            {
                                text: (payment ? payment.value.toLocaleString('fr-TN', {
                                    style: 'decimal',
                                    minimumFractionDigits: 2
                                }) : ''),
                                fontSize: 8,
                                alignment: 'right',
                                margin: [0, 3]
                            },
                            {
                                text: (payment ? payment.paymentType.name : ''),
                                fontSize: 8,
                                alignment: 'center',
                                margin: [0, 3]
                            },
                            {
                                text: (payment ? payment.number : '')
                                , fontSize: 8, alignment: 'center', margin: [0, 3]
                            },
                            filter.merchant ?
                                {
                                    text: balance.toLocaleString('fr-TN', {
                                        style: 'decimal',
                                        minimumFractionDigits: 2
                                    }), fontSize: 8, alignment: 'right', margin: [0, 3]
                                } : null
                        ].filter(Boolean);
                        salesReportData.push(row);
                    });
                });
            });
        });
    });
    salesReportData.push([{
        text: 'Total',
        fontSize: 9,
        alignment: 'center',
        bold: true, colSpan: 4 - (filter.merchant ? 1 : 0), margin: [0, 3]
    },
        '',
        ...(filter.merchant ? [] : ['']),
        '',
        {text: totalQuantitySum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalWeightSum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        '',
        {
            text: totalPriceSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}),
            fontSize: 8,
            alignment: 'right',
            bold: true,
            margin: [0, 3]
        },
        {
            text: totalmerchantCommissionSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]
        },
        {
            text: totalToPayByMerchantSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]
        },
        {
            text: totalMerchantPaymentSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]
        },
        '', '',

        ...(!filter.merchant ? [] : [{
            text: balance.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]
        }])
    ]);
    let startDate = filter.startDate || new Date();
    let refDate = _.uniq(_.map(data.transasctions, 'date')).reduce(function (a, b) {
        return a < b ? a : b;
    });
    startDate = moment(refDate).isAfter(startDate) ? startDate : refDate;
    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'landscape',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: [
            {
                text: title,
                fontSize: 14,
                alignment: 'center',
                decoration: 'underline',
                font: 'Roboto',
                bold: true,
                margin: [5, 10, 5, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            {text: generationDate, fontSize: 10, alignment: 'right'},
            filter.merchant ? {
                text: `Solde avant le ${moment(startDate).format('DD-MM-YYYY')} = ${previousBalance.toLocaleString('fr-TN', {
                    style: 'decimal',
                    minimumFractionDigits: 2
                })} DT`, fontSize: 10, alignment: 'left', bold: true, margin: [0, 10]
            } : null,

            {
                columns: [{
                    table: {
                        headerRows: 2,
                        body: [...titleRow, ...salesReportData],
                        widths: ['auto', filter.merchant ? 120 : 80, !filter.merchant ? 77 : 0, 73, 35, 35, 40, 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', filter.merchant ? 'auto' : 0].filter(Boolean),
                    }
                }],
            }
        ],
        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: ` Page ${currentPage} / ${pageCount}`,
                        alignment: 'right',
                        margin: [0, 0, 40, 80],
                        fontSize: 10
                    }
                ]
            };
        }
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

    fileName = "etatCommercant.pdf";
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
router.generateExcelAccountReport = async function (data, filter, res, username) {
    try {
        const {title, period, generationDate} = await router.generateReportTitleAccount(filter, username);
        // {transasctions:transasctions, payments:payments}
        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        ws.pageSetup = {
            orientation: 'landscape',
            paperSize: 'A4',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: {left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, footer: 0.1, header: 0.1}
        };
        let numberFormat = {numberFormat: '#,##0.00; (#,##0.00); -'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let currencyFormatStyle = {numberFormat: '_-* # ##0.00\\ [$TND]_-;-* # ##0.00\\ [$TND]_-;_-* "-"??\\ [$TND]_-;_-@_-'};
        let payments = data.payments;
        const titleRow = [(!filter.merchant ? 'Client' : ''), 'Date', 'Producteur', 'Article', 'N° Bon de vente', 'Quittance', 'Quantite', 'Poid Net', 'Prix Unit.', 'Sous Total',
            'Commission', 'Prix Total', 'Montant', 'Type', 'N°Pièce'].filter(Boolean);


        ws.cell(1, 1, 1, titleRow.length, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(title)
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, titleRow.length, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(30);
        let previousBalance = data.previousBalance;
        if (filter.merchant) {
            let startDate = filter.startDate || new Date();
            let refDate = _.uniq(_.map(data.transasctions, 'date')).reduce(function (a, b) {
                return a < b ? a : b;
            });
            startDate = moment(refDate).isAfter(startDate) ? startDate : refDate;
            const previousBalanceStyle = wb.createStyle({
                font: {size: 11, italic: true, bold: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
            ws.cell(4, 1, 4, 2, true).string('Solde avant le '.concat(moment(startDate).format('DD/MM/YYYY')).concat(' : ')).style(previousBalanceStyle);
            ws.cell(4, 3, 4, 4, true).number(previousBalance).style(previousBalanceStyle).style(currencyFormatStyle);
        }
        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const achatsColSpan = 12 - (filter.merchant ? 1 : 0); // Ajuster si le champ "Client" est inclus
        const reglementsColSpan = 3;
        ws.cell(5, 1, 5, achatsColSpan, true).string('Achats').style(headerStyle);
        ws.cell(5, achatsColSpan + 1, 5, achatsColSpan + reglementsColSpan, true).string('Règlements').style(headerStyle);
        if (filter.merchant)
            ws.cell(5, achatsColSpan + reglementsColSpan + 1, 6, achatsColSpan + reglementsColSpan + 1, true).string('Solde').style(headerStyle);

        const tableWidth = 100;
        const columnCount = titleRow.length;
        const columnWidth = Math.floor(tableWidth / columnCount);
        titleRow.forEach((title, index) => {
            ws.cell(6, index + 1).string(title).style(headerStyle);
            ws.column(index + 1).setWidth(columnWidth);
        });
        const rowStyle = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'center', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });
        const rowStyleRight = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'right', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });

        let rowIndex = 7;
        const filteredData = data.transasctions.filter(transaction => {
            return (!filter.merchant || transaction.merchant?.id === filter.merchant) &&
                (!filter.article || transaction.article?.id === filter.article);
        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));


        let totalPriceSum = 0;
        let totalQuantitySum = 0;
        let totalWeightSum = 0;
        let totalToPayByMerchantSum = 0;
        let totalmerchantCommissionSum = 0;
        let totalMerchantPaymentSum = 0;
        let colIndex = 1, columnDateHeigth = 1, paymentRowIndex, payment;
        let balance = previousBalance;
        const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
        const paymentsByMerchant = _.groupBy(payments, item => item.merchant?.name);
        Object.keys(groupedByMerchant).forEach(merchant => {
            let isFirstMerchantRow = true;
            const merchantGroup = groupedByMerchant[merchant];
            const merchantPaymentsGroup = paymentsByMerchant[merchant];
            const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
            const groupedPaymentsByDate = _.groupBy(merchantPaymentsGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
                const paymentsDateGroup = groupedPaymentsByDate[date];
                columnDateHeigth = Math.max(dateGroup.length - 1), (paymentsDateGroup ? (paymentsDateGroup.length - 1) : 0);
                const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
                let isFirstDateRow = true;
                paymentRowIndex = 0;
                Object.keys(groupedByProducer).forEach(producer => {
                    const producerGroup = groupedByProducer[producer];
                    const groupedByArticle = _.groupBy(producerGroup, item => item.article?.name);
                    let isFirstProducerRow = true;
                    Object.keys(groupedByArticle).forEach(article => {
                        const articleGroup = groupedByArticle[article];

                        articleGroup.forEach((transaction, index) => {
                            totalQuantitySum += transaction.boxes || 0;
                            totalWeightSum += transaction.netWeight || 0;
                            totalPriceSum += transaction.totalPrice || 0;
                            totalmerchantCommissionSum += transaction.merchantCommission || 0;
                            totalToPayByMerchantSum += transaction.totalToPayByMerchant || 0;
                            balance -= transaction.totalToPayByMerchant || 0;
                            colIndex = 1;
                            payment = paymentsDateGroup ? paymentsDateGroup[paymentRowIndex] : null;
                            paymentRowIndex++;
                            if (payment) {
                                totalMerchantPaymentSum += payment.value || 0;
                                balance += payment.value;
                            }
                            if (!filter.merchant) {
                                if (isFirstMerchantRow) {
                                    ws.cell(rowIndex, colIndex, rowIndex + merchantGroup.length - 1, colIndex, true).string(transaction.merchant?.name.toUpperCase() || "Non spécifié").style(rowStyle);
                                    ws.column(colIndex).setWidth(15);
                                    isFirstMerchantRow = false;
                                }
                                colIndex++;
                            }
                            if (isFirstDateRow) {
                                ws.cell(rowIndex, colIndex, rowIndex + columnDateHeigth, colIndex, true).date(transaction.date).style(rowStyle).style(dateFormatStyle);
                                ws.column(colIndex).setWidth(8);
                                isFirstDateRow = false;
                            }
                            colIndex++;
                            if (isFirstProducerRow) {
                                ws.cell(rowIndex, colIndex, rowIndex + producerGroup.length - 1, colIndex, true).string(transaction.sale.producerName.toUpperCase() || "Non spécifié").style(rowStyle);
                                ws.column(colIndex).setWidth(15);
                                isFirstProducerRow = false;
                            }
                            colIndex++;
                            ws.cell(rowIndex, colIndex, rowIndex + articleGroup.length - 1, colIndex, true).string(transaction.article?.name.toUpperCase() || "Non spécifié").style(rowStyle);
                            ws.column(colIndex).setWidth(9);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.receiptNumber || 0).style(rowStyle);
                            ws.column(colIndex).setWidth(12);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(transaction.quittance || '').style(rowStyle);
                            ws.column(colIndex).setWidth(12);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.boxes || 0).style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(12);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.netWeight || 0).style(rowStyle).style(numberFormat);
                            ws.column(colIndex).setWidth(12);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.unitPrice).style(numberFormat).style(rowStyleRight);
                            ws.column(colIndex).setWidth(12);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.totalPrice).style(numberFormat).style(rowStyleRight);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.merchantCommission).style(numberFormat).style(rowStyleRight);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(transaction.totalToPayByMerchant).style(numberFormat).style(rowStyleRight);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).number(payment ? payment.value : 0).style(numberFormat).style(rowStyleRight);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(payment ? payment.paymentType.name : '').style(rowStyle);
                            ws.column(colIndex).setWidth(15);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(payment ? (payment.nymber || '') : '').style(rowStyle);
                            ws.column(colIndex).setWidth(15);
                            if (filter.merchant) {
                                colIndex++;
                                ws.cell(rowIndex, colIndex).number(balance).style(rowStyle).style(numberFormat);
                                ws.column(colIndex).setWidth(15);
                            }
                            rowIndex++;
                        });
                    });
                });
            });
        });
        colIndex = 6;
        if (filter.merchant)
            colIndex--;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        const totalPriceStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'right', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, 1, rowIndex, colIndex, true).string('Total').style(totalStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalQuantitySum).style(totalPriceStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalWeightSum).style(totalPriceStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).style(totalPriceStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalPriceSum).style(totalPriceStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalmerchantCommissionSum).style(totalPriceStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalToPayByMerchantSum).style(totalPriceStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalMerchantPaymentSum).style(totalPriceStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).style(totalPriceStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex).style(totalPriceStyle);
        if (filter.merchant) {
            colIndex++;
            ws.cell(rowIndex, colIndex).number(balance).style(totalPriceStyle).style(currencyFormatStyle);
        }
        const fileName = "Etat_du_compte_commercant.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        wb.write(filePath, function (err, stats) {
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch
        (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({success: false, message: err.message});
    }

}
;
module.exports = router;

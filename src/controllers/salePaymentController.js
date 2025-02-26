const router = require('express').Router();
const dao = require("../dao/salePaymentDao");
const saleDao = require("../dao/saleDao");
const Response = require("../utils/response");
const paymentDao = require("../dao/paymentDao");
const paymentController = require("./paymentController");
const saleController = require("./saleController");
const balanceController = require("./balanceController");
const { Shipowner, Sale} = require("../models");
const _ = require("lodash");
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const xl = require("excel4node");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving salePayment :', error);
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
        console.error('Error retrieving salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/findWithDetails', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.findWithDetails(criteria);
        const count = await dao.count({where: whereCriteria});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const salePayment = req.body;
    try {
        // console.log("=====================>salePayment : " + JSON.stringify(salePayment));
        if (tools.isFalsey(salePayment.paymentId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        if (tools.isFalsey(salePayment.saleId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = await paymentDao.get(salePayment.paymentId);
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let sale = await saleDao.get(salePayment.saleId);
        if (!sale)
            return res.status(404).json(new Response({error: 'Sale not found error'}, true));
        salePayment.paymentTypeId = payment.paymentTypeId;
        try {
            payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [salePayment], [], []);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        payment = await paymentController.checkConsumptionInfo(payment);
        const salePayments = await dao.list({where: {saleId: sale.id}});
        const affectedPaymentsValue = _.sumBy(salePayments, 'value');
        if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        else {
            sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
            sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
            sale = await saleController.checkPaymentInfo(sale);
        }
        salePayment.value = Number(parseFloat(salePayment.value).toFixed(3));
        const created = await dao.create(salePayment);
        sale = await saleDao.update(sale);
        await paymentDao.update(payment);
        if (sale.shipOwnerId)
            await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});


router.put('/update', async (req, res) => {
    const salePayment = req.body;
    try {
        if (tools.isFalsey(salePayment.paymentId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        if (tools.isFalsey(salePayment.saleId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = await paymentDao.get(salePayment.paymentId);
        let oldPayment;
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let sale = await saleDao.get(salePayment.saleId);
        if (!sale)
            return res.status(404).json(new Response({error: 'Sale not found error'}, true));
        salePayment.paymentTypeId = payment.paymentTypeId;
        const oldSalePayment = await dao.get(salePayment.id);
        if (oldSalePayment.paymentId == salePayment.paymentId && oldSalePayment.saleId == salePayment.saleId) {
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [salePayment], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            const salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            const affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
            // console.log("=====================>payment : " + JSON.stringify(payment));
        } else if (oldSalePayment.paymentId == salePayment.paymentId && oldSalePayment.saleId != salePayment.saleId) {
            //Check the payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [salePayment], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the new sale
            let salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            let affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
            //Check the old sale
            sale = oldSalePayment.sale;
            salePayments = await dao.list({
                where: {
                    saleId: oldSalePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if (affectedPaymentsValue > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = affectedPaymentsValue;
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        } else if (oldSalePayment.paymentId != salePayment.paymentId && oldSalePayment.saleId == salePayment.saleId) {
            //Check the new payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [salePayment], [], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the old payment
            payment = oldSalePayment.payment;
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [], [salePayment]);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check sale
            const salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            const affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        } else if (oldSalePayment.paymentId != salePayment.paymentId && oldSalePayment.saleId != salePayment.saleId) {
            //Check the new payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [salePayment], [], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the old payment
            payment = oldSalePayment.payment;
            try {
                oldPayment = await paymentController.checkAndCalculatePaymentCapacityForSale(oldPayment, [], [], [salePayment]);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // oldPayment = await paymentController.checkConsumptionInfo(oldPayment);
            // await paymentDao.update(oldPayment);
            //Check the new sale
            let salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            let affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
            //Check the old sale
            sale = oldSalePayment.sale;
            salePayments = await dao.list({
                where: {
                    saleId: oldSalePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if (affectedPaymentsValue > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = affectedPaymentsValue;
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        }
        const updated = await dao.update(salePayment);
        if (payment) {
            payment = await paymentController.checkConsumptionInfo(payment);
            await paymentDao.update(payment);
        }
        if (oldPayment) {
            oldPayment = await paymentController.checkConsumptionInfo(oldPayment);
            await paymentDao.update(oldPayment);
        }
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        let salePayment = await dao.get(id);
        // console.log("=====================>id : " + JSON.stringify(id));
        // console.log("=====================>salePayment : " + JSON.stringify(salePayment));
        if (!salePayment)
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = salePayment.payment;
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let sale = salePayment.sale;
        if (!sale)
            return res.status(404).json(new Response({error: 'Sale not found error'}, true));
        try {
            payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [], [salePayment]);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        payment = await paymentController.checkConsumptionInfo(payment);
        const salePayments = await dao.list({
            where: {
                saleId: sale.id,
                id: {'!': salePayment.id}
            }
        });
        const affectedPaymentsValue = _.sumBy(salePayments, 'value');
        if (affectedPaymentsValue > sale.totalToPay)
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        else {
            sale.totalPaid = affectedPaymentsValue;
            sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
            sale = await saleController.checkPaymentInfo(sale);
        }
        await dao.remove(id);
        await saleDao.update(sale);
        await paymentDao.update(payment);
        res.status(201).json(new Response());
    } catch (error) {
        console.error('Error removing salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/generateSalePaymentReport', async (req, res) => {
    try {
        const dataToReport = await router.getSalePaymentReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelSalePaymentReport(dataToReport, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFSalePaymentReport(dataToReport, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating Paiement report:', error);
        res.status(500).json({error: 'Error generating report'});
    }
});
router.getSalePaymentReportData = async function (options) {
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
    if (!tools.isFalsey(options.producer)) {
        criteria.where['$sale.producerName$']= options.producer;
    }

    let salePayment = await dao.findAll(criteria);
    return salePayment;

}
router.generateReportTitleSalePayment = async function (filter, username) {
    const {producer, startDate, endDate, dateRule} = filter;
    let title = 'État de paiement des Producteurs';
    let period = '';
    let producerName = '';

    if (producer) {
        const producerData =  await Sale.findOne({where: { producerName: producer }});
        if (producerData) {
            title = `État de paiement du producteur : ${producerData.producerName.toUpperCase()}`;
            producerName = producerData.name;
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

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, period, generationDate,
    };
}
router.generatePDFSalePaymentReport = async function (data, filter, res, username) {
    const {title, period, generationDate} = await router.generateReportTitleSalePayment(filter, username);
    let titleRow = [];
    titleRow.push([
        !filter.producer ? {text: 'Producteur', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}: null,
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Montant', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Type', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Numéro', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Echéance', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Signataire', fontSize:10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}
    ].filter(Boolean));

    const filteredData = data.filter(salePayment => {
        if (!filter.producer) return true;

        return (!filter.producer || salePayment.sale.producerName === filter.producer);
    });

    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    let salePaymentReportData = [];
    let totalPriceSum = 0;
    let totalSaleSum =0;
    const countedSales = new Set();
    const groupedByProducer = _.groupBy(filteredData, item => item.sale.producerName);
    Object.keys(groupedByProducer).forEach(producer => {
        const producerGroup = groupedByProducer[producer];
            const groupedByDate = _.groupBy(producerGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
              const dateGroup = groupedByDate[date];

                let isFirstRow = true;
                const calculateMargin = (rowSpan, lineHeight = 2.5, fontSize = 9) => {
                    if (rowSpan == 1)
                        return [0, 0, 0, 0];
                    const totalRowHeight = rowSpan * fontSize * lineHeight;
                    const cellHeight = fontSize;
                    const verticalMargin = (totalRowHeight - cellHeight) / 2;
                    return [0, verticalMargin, 0, verticalMargin];
                };

            dateGroup.forEach((salePayment, index) => {
                    totalPriceSum += salePayment.value;
                    const saleId = salePayment.sale.id;

                  if (!countedSales.has(saleId)) {
                      totalSaleSum += salePayment.sale.totalToPay;
                      countedSales.add(saleId);
                  }

                    if (!salePayment.sale.producerName) return;
                    const row = [
                        !filter.producer ? (isFirstRow ? {
                            text: salePayment.sale.producerName.toUpperCase(),
                            rowSpan: producerGroup.length,
                            fontSize: 9,
                            alignment: 'center',
                            margin: calculateMargin(producerGroup.length)
                        } : null) : null,

                        isFirstRow ? {text: moment(salePayment.date).format('DD-MM-YYYY'), rowSpan: dateGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(dateGroup.length)} : null,
                        {
                            text: salePayment.value.toLocaleString('fr-TN', {
                                style: 'decimal',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            }), fontSize: 9, alignment: 'right', margin: [0, 3]
                        },
                        {text: salePayment.paymentType?.name, fontSize: 9, alignment: 'center', margin: [0, 3]},
                        {text: salePayment.payment.number || '', fontSize: 9, alignment: 'center', margin: [0, 3]},
                        {text: salePayment.payment.dueDate, fontSize: 9, alignment: 'center', margin: [0, 3]},
                        {text: salePayment.payment.signatory, fontSize: 9, alignment: 'center', margin: [0, 3]}
                    ].filter(Boolean);
                    salePaymentReportData.push(row);
                });
            });
    });

    salePaymentReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true,colSpan: 2 -  (filter.producer ? 1 : 0) , margin: [0, 3]},
        ...(filter.producer ? [] : ['-']),
        {text: totalPriceSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]},
        {text: '-', fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: '-', fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: '-', fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: '-', fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},


    ]);
    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
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
                margin: [0, 20, 0, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            {text: generationDate, fontSize: 10, alignment: 'right'},
            '\n',

            {
                columns: [{
                    table: {
                        headerRows: 1,
                        body: [...titleRow, ...salePaymentReportData],
                        widths: [!filter.producer ? 80 : 0, 70,50,70, 50,'*','*',].filter(Boolean),
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

    fileName = "etatPaiement.pdf";
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
router.generateExcelSalePaymentReport = async function (data, filter, res, username) {
    try {
        const {title, period, generationDate} = await router.generateReportTitleSalePayment(filter, username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const titleRow = [(!filter.producer ? 'Producteur' : ''), 'Date', 'Montant',  'Type', 'Numéro ', 'Echéance', 'Signataire'].filter(Boolean);

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
        ws.row(2).setHeight(40);
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
        const filteredData = data.filter(salePayment  => {
            return (!filter.producer || salePayment.sale.producerName === filter.producer);

        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        let numberFormat = {numberFormat: '#,##0.00; (#,##0.00); -'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let currencyFormatStyle = {numberFormat: '_-* # ##0.00\\ [$TND]_-;-* # ##0.00\\ [$TND]_-;_-* "-"??\\ [$TND]_-;_-@_-'};

        let totalPriceSum = 0;
        let totalSaleSum =0;
        const countedSales = new Set();
        const groupedByProducer = _.groupBy(filteredData, item => item.sale.producerName);
        Object.keys(groupedByProducer).forEach(producer => {
            let isFirstProducerRow = true;
            const producerGroup = groupedByProducer[producer];
                const groupedByDate = _.groupBy(producerGroup, item => moment(item.date).format('DD-MM-YYYY'));
                Object.keys(groupedByDate).forEach(date => {
                    const dateGroup = groupedByDate[date];
                    let isFirstDateRow = true;
                    dateGroup.forEach((salePayment, index) => {
                        totalPriceSum += salePayment.value || 0;
                        const saleId = salePayment.sale.id;
                        if (!countedSales.has(saleId)) {
                            totalSaleSum += salePayment.sale.totalToPay;
                            countedSales.add(saleId);
                        }

                        if (!salePayment.sale.producerName) return;
                        if (!filter.producer) {
                            if (isFirstProducerRow) {
                                ws.cell(rowIndex, 1, rowIndex + producerGroup.length - 1, 1, true)
                                    .string(salePayment.sale.producerName.toUpperCase()).style(rowStyle);
                                ws.column(1).setWidth(15);
                                isFirstProducerRow = false;
                            }
                        }
                        if (isFirstDateRow) {
                            ws.cell(rowIndex, filter.producer ? 1 : 2, rowIndex + dateGroup.length - 1, filter.producer ? 1 : 2, true)
                                .date(salePayment.date).style(dateFormatStyle)
                                .style(rowStyle);
                            ws.column(filter.producer ? 1 : 2).setWidth(8);
                            isFirstDateRow = false;
                        }
                        let colIndex = 2;
                        if (!filter.producer)
                            colIndex++;
                        ws.cell(rowIndex, colIndex).number(salePayment.value).style(rowStyleRight).style(numberFormat);
                        ws.column(colIndex).setWidth(15);
                        colIndex++;
                        ws.cell(rowIndex, colIndex).string(salePayment.paymentType?.name || '').style(rowStyle).style(integerFormat);
                        ws.column(colIndex).setWidth(10);
                        colIndex++;
                        ws.cell(rowIndex, colIndex).string(salePayment.payment.number || 0).style(rowStyle).style(integerFormat);
                        ws.column(colIndex).setWidth(7);
                        colIndex++;
                        ws.cell(rowIndex, colIndex).string(salePayment.payment.dueDate || '').style(rowStyle).style(dateFormatStyle);
                        ws.column(colIndex).setWidth(10);
                        colIndex++;
                        ws.cell(rowIndex, colIndex).string(salePayment.payment.signatory || '').style(rowStyle).style(integerFormat);
                        ws.column(colIndex).setWidth(9);
                        colIndex++;

                       rowIndex++;
                    });
                });
            });


        let totalStartCol = 1;
        let totalEndCol = 2;
        if (filter.producer) totalEndCol -= 1;

        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, totalStartCol, rowIndex, totalEndCol, true).string('Total').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalPriceSum).style(totalStyle).style(currencyFormatStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).string('-').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).string('-').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).string('-').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).string('-').style(totalStyle);
        totalEndCol++;


        const fileName = "etatSalePaiemnt.xlsx";
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

module.exports = router;

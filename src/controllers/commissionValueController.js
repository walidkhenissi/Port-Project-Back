var router = require('express').Router();
const dao = require("../dao/commissionValueDao");
const commissionBeneficiaryController = require("../controllers/commissionBeneficiaryController");
const Response = require("../utils/response");
const {CommissionValue, Merchant, Shipowner, Beneficiary} = require("../models");
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
        console.error('Error retrieving commissionValues :', error);
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
        console.error('Error retrieving commissionValuess :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    let commissionValue = req.body;
    try {
        try {
            router.checkDataConstraints(commissionValue);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        if (tools.isFalsey(commissionValue.date))
            commissionValue.date = new Date();
        const createdCommissionValue = await dao.create(commissionValue);
        res.status(201).json(new Response(createdCommissionValue));
    } catch (error) {
        console.error('Error creating commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    let commissionValue = req.body;
    try {
        try {
            router.checkDataConstraints(commissionValue);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        if (tools.isFalsey(commissionValue.date))
            commissionValue.date = new Date();
        const updated = await dao.update(commissionValue);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.checkDataConstraints = function (commissionValue) {
    let isError = false;
    if (!commissionValue.commissionId)
        isError = true;
    else if (!commissionValue.salesTransactionId)
        isError = true;
    if (isError) {
        const error = new Error('Data contraints error');
        console.error(error.message);
        throw error;
    }
}

router.updateCommissionValuesBySaleTransaction = async function (saleTransaction) {
    try {
        const commissionController = require("../controllers/commissionController");
        let availableCommissionsHistories = await commissionController.getAvailableCommissionsAtDate(saleTransaction.sale.date, null);
        await CommissionValue.destroy({where: {salesTransactionId: saleTransaction.id}});
        let commissionValues = [];
        for (let item in availableCommissionsHistories) {
            const commissionHistory = availableCommissionsHistories[item];
            let comValue = 0;
            if (commissionHistory.isPercentValue)
                comValue = saleTransaction.totalPrice * commissionHistory.value;
            else if (commissionHistory.isPerUnitValue)
                comValue = saleTransaction.boxes * commissionHistory.value;
            if (comValue > 0) {
                let commissionValue = await dao.create({
                    value: Number(parseFloat(comValue).toFixed(3)),
                    date: saleTransaction.date,
                    commissionId: commissionHistory.Commission.id,
                    salesTransactionId: saleTransaction.id,
                    saleNumber: saleTransaction.sale ? (saleTransaction.sale.number || '') : '',
                    saleReceiptNumber: saleTransaction.sale.receiptNumber,
                    sateTransactionQuittance: saleTransaction.quittance
                });
                commissionValues.push(commissionValue);
            }
        }
        return commissionValues;
    } catch (error) {
        const msg = 'Error updating commission values for saleTransaction';
        console.error(msg, error);
        throw new Error(msg);
    }
}

router.post('/findWithDetails', async (req, res) => {
    let criteria = req.body;
    try {
        //Possible criteria :
        //commissionBeneficiaryId
        //date
        //value
        //commissionId
        //
        let commissionIds = [];
        criteria.where = criteria.where || {};
        if (criteria.where.commissionBeneficiaryId) {
            let date = new Date();
            if (criteria.where.date)
                date = criteria.where.date;
            let availableCommissionBeneficiaries = await commissionBeneficiaryController.getAvailableCommissionBeneficiariesAtDate(date);
            let commissionBeneficiaries = _.filter(availableCommissionBeneficiaries, function (item) {
                return item.beneficiaryId == criteria.where.commissionBeneficiaryId;
            });
            commissionIds = _.keys(_.keyBy(commissionBeneficiaries, 'commissionId')).map(Number);
            delete criteria.where.commissionBeneficiaryId;
        }
        if (criteria.where.commissionId) {
            let temp = [];
            for (let item in criteria.where.commissionId) {
                let id = criteria.where.commissionId[item];
                if (commissionIds.includes(id)) {
                    temp.push(id);
                }
            }
            commissionIds = temp;
            if (!commissionIds.length)
                commissionIds = [-1];//any chosen commissionId belongs to chosen commissionBeneficiaryId
        }
        if (commissionIds.length)
            criteria.where.commissionId = commissionIds;
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        const sum = await dao.sum({where: {id: _.map(data, 'id')}});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        response.metaData.sum = sum;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving commissionValuess :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});


router.post('/generateCommissionsReport', async (req, res) => {

    try {
        const dataToReport = await router.getCommissionsReportData(req.body);
        const username = req.session.username;
        if (req.body.pdfType) {
            router.generatePDFCommissionsReport(dataToReport, req.body, res, username);
        } else if (req.body.excelType) {
            router.generateExcelCommissionsReport(dataToReport, req.body, res, username);
        }
    } catch (error) {
        console.error('Error generating solde report:', error);

        res.status(500).json({error: 'Error generating report'});
    }
});


router.getCommissionsReportData = async function (options) {
    let criteria = {where: {}, sort: {date: 'ASC'}}, _startDate;
    if (!tools.isFalsey(options.dateRule)) {
        _startDate = options.startDate;
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
    if (!tools.isFalsey(options.recipientNumberRule) && !tools.isFalsey(options.recipientNumberValue1)) {
        switch (options.recipientNumberRule) {
            case 'equals' : {
                criteria.where.saleReceiptNumber = options.recipientNumberValue1;
                break;
            }
            case 'notEquals' : {
                criteria.where.saleReceiptNumber = {'!': options.recipientNumberValue1};
                break;
            }
            case 'lowerThan' : {
                criteria.where.saleReceiptNumber = {'<=': options.recipientNumberValue1};
                break;
            }
            case 'greaterThan' : {
                criteria.where.saleReceiptNumber = {'>=': options.recipientNumberValue1};
                break;
            }
            case 'between' : {
                if (!tools.isFalsey(options.recipientNumberValue2)) {
                    criteria.where.saleReceiptNumber = {
                        '>=': options.recipientNumberValue1,
                        '<=': options.recipientNumberValue2
                    };
                }
                break;
            }
            default:
                break;
        }
    }
    let commissionBeneficiaries = await commissionBeneficiaryController.getAvailableCommissionBeneficiariesAtDate(_startDate);
    if (options.beneficiaryId)
        commissionBeneficiaries = _.filter(commissionBeneficiaries, function (item) {
            return item.beneficiaryId == options.beneficiaryId;
        });
    criteria.where.commissionId = _.map(commissionBeneficiaries, 'commissionId');
    let commissionValues = await dao.find(criteria);
    // const commissionValueGroup = _.groupBy(commissionValues, function (commissionValue) {
    //     return commissionValue.saleReceiptNumber;
    // });
    // Object.keys(commissionValueGroup).forEach(saleReceiptNumber => {
    //     // for (const commissionValueGroup of commissionValues) {
    //     console.log("=====================>commissionValueGroup[saleReceiptNumber] : " + JSON.stringify(commissionValueGroup[saleReceiptNumber]));
    //     let commissionValue = commissionValueGroup[saleReceiptNumber][0];
    //     console.log("=====================>date : " + moment(commissionValue.date).format('DD-MM-YYYY') + ', N° bon de vente : ' + commissionValue.saleReceiptNumber.toString() +
    //         +', ' + commissionValue.commission.name + ' : ' + _.sum(commissionValueGroup[saleReceiptNumber], function (commissionValue) {
    //             console.log("**************************************>commissionValue : " + JSON.stringify(commissionValue));
    //             return commissionValue.value;
    //         }));
    // });
    return commissionValues;
}


router.generateReportCommissionsTitle = async function (filter, username) {
    // console.log("=====================>filter : " + JSON.stringify(filter));
    const {
        beneficiaryId,
        startDate,
        endDate,
        dateRule,
        recipientNumberRule,
        recipientNumberValue1,
        recipientNumberValue2
    } = filter;
    let title = 'Etat de commissions ';
    let period = '';
    let recipientNumber = '';

    let beneficiaryName = '';
    if (beneficiaryId) {
        const beneficiary = await Beneficiary.findByPk(beneficiaryId);
        if (beneficiary) {
            beneficiaryName = beneficiary.name;
            title = `Etat de commissions pour : ${beneficiaryName.toUpperCase()}`;
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
    switch (recipientNumberRule) {
        case 'equals':
            recipientNumber = recipientNumberValue1 ? `N° bon de vente : ${recipientNumberValue1}` : '';
            break;
        case 'notEquals':
            recipientNumber = recipientNumberValue1 ? `N° bon de vente autre que : ${recipientNumberValue1}` : '';
            break;
        case 'lowerThan':
            recipientNumber = recipientNumberValue1 ? `N° bon de vente inférieur à : ${recipientNumberValue1}` : '';
            break;
        case 'greaterThan':
            recipientNumber = recipientNumberValue1 ? `N° bon de vente supérieur à : ${recipientNumberValue1}` : '';
            break;
        case 'between':
            const formattedStart = recipientNumberValue1 ? recipientNumberValue1 : null;
            const formattedEnd = recipientNumberValue2 ? recipientNumberValue2 : null;
            recipientNumber = formattedStart && formattedEnd ? `N° bon de vente  entre : ${formattedStart} et ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : '';
            break;
        default:
            recipientNumber = '';
    }

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;
    return {
        title, period, recipientNumber, generationDate
    };
};


router.generatePDFCommissionsReport = async function (data, filter, res, username) {
    let metaDataTiltle = await router.generateReportCommissionsTitle(filter, username);
    let titleRow = [];
    titleRow.push([
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'N° Bon de vente ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'Total vente ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'Commission ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'Valeur commission', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]}
    ].filter(Boolean));
    let salesReportData = [];
    let totalCommissions = 0, totalSales = 0, totalSale = 0;

    const groupedByDate = _.groupBy(data, item => moment(item.date).format('DD-MM-YYYY'));
    Object.keys(groupedByDate).forEach(date => {
        const dateGroup = groupedByDate[date];
        const groupedByRecipientNumber = _.groupBy(dateGroup, item => item.saleReceiptNumber);
        let isFirstDateRow = true;
        Object.keys(groupedByRecipientNumber).forEach(receiptNumber => {
            const receiptNumberGroup = groupedByRecipientNumber[receiptNumber];
            let isFirstReceiptRow = true;
            let commissionsCount = _.keys(_.keyBy(receiptNumberGroup, 'commissionId')).length;
            const groupedByCommission = _.groupBy(receiptNumberGroup, item => item.commission.id);
            Object.keys(groupedByCommission).forEach(commissionId => {
                let valuesForCommission = groupedByCommission[commissionId];
                let commission = valuesForCommission[0].commission;
                let totalCommissionValue = _.sumBy(valuesForCommission, function (commissionValue) {
                    return commissionValue.value;
                });
                totalCommissions += totalCommissionValue || 0;
                if (isFirstReceiptRow) {
                    totalSale = _.sumBy(valuesForCommission, function (item) {
                        return item.salesTransaction ? (item.salesTransaction.totalPrice || 0) : 0;
                    });
                    totalSales += totalSale || 0;
                }
                const row = [
                    {
                        text: moment(valuesForCommission[0].date).format('DD-MM-YYYY'),
                        fontSize: 9,
                        alignment: 'center'
                    },
                    isFirstReceiptRow ? {
                        text: Number(parseInt(receiptNumber)),
                        fontSize: 9,
                        rowSpan: commissionsCount,
                        alignment: 'center'
                    } : {text: ''},
                    isFirstReceiptRow ? {
                        text: totalSale.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }),
                        rowSpan: commissionsCount,
                        fontSize: 9, alignment: 'right'
                    } : {text: ''},
                    {
                        text: commission.name, fontSize: 9, alignment: 'left'
                    },
                    {
                        text: totalCommissionValue.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right'
                    }

                ].filter(Boolean);
                salesReportData.push(row);
                isFirstReceiptRow = false;
            });
        });
    });


    salesReportData.push([
        {
            text: 'Total',
            fontSize: 10,
            alignment: 'center',
            bold: true,
            colSpan: 2,
            margin: [0, 3]
        },
        {text: ''},
        {
            text: totalSales.toLocaleString('fr-TN', {
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
            text: totalCommissions.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }),
            fontSize: 9,
            alignment: 'right',
            bold: true,
            colSpan: 2,
            margin: [0, 3]
        },
        {text: ''},
    ]);

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10,
            columnGap: 20
        },
        content: [
            {
                text: metaDataTiltle.title,
                fontSize: 14,
                alignment: 'center',
                decoration: 'underline',
                font: 'Roboto',
                bold: true,
                margin: [0, 20, 0, 10]
            },
            {text: metaDataTiltle.period, fontSize: 14, alignment: 'center', margin: [0, 3]},
            {text: metaDataTiltle.recipientNumber, fontSize: 14, alignment: 'center', margin: [0, 3]},
            // {text: montant, fontSize: 14, alignment: 'center', margin: [0, 3]},
            {text: metaDataTiltle.generationDate, fontSize: 10, alignment: 'right', margin: [0, 0, 0, 10]},
            //${username}
            {
                columns: [
                    {
                        table: {
                            body: [...titleRow, ...salesReportData],
                            widths: ['15%', '15%', '15%', '40%', '15%'].filter(Boolean)
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

    fileName = "pdfFile.pdf";
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

router.generateExcelCommissionsReport = async function (data, filter, res, username) {
    try {
        let metaDataTiltle = await router.generateReportCommissionsTitle(filter, username);
        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Etat de commissions');
        const titleRow = ['Date', 'N° Bon de vente', 'Total vente', 'Comission', 'Valeur commission'].filter(Boolean);

        ws.cell(1, 1, 1, titleRow.length, true)
            .string(metaDataTiltle.generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(metaDataTiltle.title)
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, titleRow.length, true)
            .string(metaDataTiltle.period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.cell(4, 1, 4, titleRow.length, true)
            .string(metaDataTiltle.recipientNumber)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });

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
        const rowStyleLeft = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'left', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });

        let rowIndex = 7;
        let colIndex = 1;
        const groupedByDate = _.groupBy(data, item => moment(item.date).format('DD-MM-YYYY'));
        let totalCommissions = 0, totalSales = 0;
        let numberFormat = {numberFormat: '#,##0.00; (#,##0.00); -'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let currencyFormatStyle = {numberFormat: '_-* # ##0.00\\ [$TND]_-;-* # ##0.00\\ [$TND]_-;_-* "-"??\\ [$TND]_-;_-@_-'};
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const groupedByRecipientNumber = _.groupBy(dateGroup, item => item.saleReceiptNumber);
            let isFirstDateRow = true;
            Object.keys(groupedByRecipientNumber).forEach(receiptNumber => {
                const receiptNumberGroup = groupedByRecipientNumber[receiptNumber];
                let isFirstReceiptRow = true;
                let commissionsCount = _.keys(_.keyBy(receiptNumberGroup, 'commissionId')).length;
                const groupedByCommission = _.groupBy(receiptNumberGroup, item => item.commission.id);
                Object.keys(groupedByCommission).forEach(commissionId => {
                    let valuesForCommission = groupedByCommission[commissionId];
                    let commission = valuesForCommission[0].commission;
                    let totalCommissionValue = _.sumBy(valuesForCommission, function (commissionValue) {
                        return commissionValue.value;
                    });
                    totalCommissions += totalCommissionValue || 0;
                    colIndex = 1;
                    ws.cell(rowIndex, colIndex).date(valuesForCommission[0].date).style(rowStyle).style(dateFormatStyle);
                    colIndex++;
                    if (isFirstReceiptRow) {
                        ws.cell(rowIndex, colIndex, rowIndex + commissionsCount - 1, colIndex, true).number(Number(parseInt(receiptNumber))).style(rowStyleRight).style(integerFormat);
                        colIndex++;
                        let totalSale = _.sumBy(valuesForCommission, function (item) {
                            return item.salesTransaction ? (item.salesTransaction.totalPrice || 0) : 0;
                        });
                        totalSales += totalSale || 0;
                        ws.cell(rowIndex, colIndex, rowIndex + commissionsCount - 1, colIndex, true).number(totalSale).style(rowStyleRight).style(numberFormat);
                        isFirstReceiptRow = false;
                        colIndex++;
                    } else {
                        colIndex++;
                        colIndex++;
                    }
                    ws.cell(rowIndex, colIndex).string(commission.name).style(rowStyleLeft);
                    colIndex++;
                    ws.cell(rowIndex, colIndex).number(totalCommissionValue).style(rowStyleRight).style(numberFormat);
                    rowIndex++;
                });
            });
        });

        colIndex = 1;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        const totalValueStyle = wb.createStyle({
            font: {size: 9, bold: true},
            alignment: {horizontal: 'right', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + 1, true).string('Total').style(totalStyle);
        colIndex++;
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalSales).style(totalValueStyle).style(currencyFormatStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + 1, true).number(totalCommissions).style(totalValueStyle).style(currencyFormatStyle);

        const fileName = "Commissions.xlsx";
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

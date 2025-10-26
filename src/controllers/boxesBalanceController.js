var router = require('express').Router();
const dao = require("../dao/boxesBalanceDao");
const boxesTransactionDao = require("../dao/boxesTransactionDao");
const Response = require("../utils/response");
const {sequelize, BoxesTransaction, Merchant, Shipowner, BoxesType} = require("../models");
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
        console.error('Error retrieving boxesBalance :', error);
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
        console.error('Error retrieving boxesBalance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving boxesBalance :', error);
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
        balance.balance = balance.credit - balance.debit;
        const created = await dao.create(balance);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating boxesBalance :', error);
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
        balance.balance = balance.credit - balance.debit;
        const updated = await dao.update(balance);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating boxesBalance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing boxesBalance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.updateByMerchant = async function (merchantId) {
    let result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('credit')), 'credit'],
            [sequelize.fn('sum', sequelize.col('merchantSalesCredit')), 'merchantSalesCredit'],
            [sequelize.fn('sum', sequelize.col('debit')), 'debit'],
            "boxesTypeId"
        ],
        raw: true,
        group: ["boxesTypeId"],
        where: {merchantId: merchantId}
    });
    const balancesByBoxesTypeIds = _.groupBy(result, "boxesTypeId");
    const balances = await dao.find({where: {merchantId: merchantId}});
    const existingBalancesByBoxesTypeIds = _.groupBy(balances, "boxesTypeId");
    const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
    for (const boxesType of boxesTypes) {
        let existingBalance = existingBalancesByBoxesTypeIds[boxesType.id];
        if (existingBalance && existingBalance.length)
            existingBalance = existingBalance[0];
        else
            existingBalance = null;
        let newBalance = balancesByBoxesTypeIds[boxesType.id];
        if (newBalance && newBalance.length)
            newBalance = newBalance[0];
        else
            newBalance = null;
        const _credit = newBalance ? (newBalance["credit"] || 0) : 0;
        const _debit = newBalance ? (newBalance["debit"] || 0) : 0;
        const _merchantSalesCredit = newBalance ? (newBalance["merchantSalesCredit"] || 0) : 0;
        if (!existingBalance)
            await dao.create({
                credit: _credit + _merchantSalesCredit,
                debit: _debit,
                balance: _credit + _merchantSalesCredit - _debit,
                merchantId: merchantId,
                boxesTypeId: boxesType.id
            });
        else {
            existingBalance.credit = _credit + _merchantSalesCredit;
            existingBalance.debit = _debit;
            existingBalance.balance = _credit + _merchantSalesCredit - _debit;
            await dao.update(existingBalance);
        }
    }
}

router.updateByShipOwner = async function (shipOwnerId) {
    let result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('credit')), 'credit'],
            [sequelize.fn('sum', sequelize.col('debit')), 'debit'],
            "boxesTypeId"
        ],
        raw: true,
        group: ["boxesTypeId"],
        where: {shipOwnerId: shipOwnerId}
    });
    const balancesByBoxesTypeIds = _.groupBy(result, "boxesTypeId");
    const balances = await dao.find({where: {shipOwnerId: shipOwnerId}});
    const existingBalancesByBoxesTypeIds = _.groupBy(balances, "boxesTypeId");
    const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
    for (const boxesType of boxesTypes) {
        let existingBalance = existingBalancesByBoxesTypeIds[boxesType.id];
        if (existingBalance && existingBalance.length)
            existingBalance = existingBalance[0];
        else
            existingBalance = null;
        let newBalance = balancesByBoxesTypeIds[boxesType.id];
        if (newBalance && newBalance.length)
            newBalance = newBalance[0];
        else
            newBalance = null;
        const _credit = newBalance ? (newBalance["credit"] || 0) : 0;
        const _debit = newBalance ? (newBalance["debit"] || 0) : 0;
        if (!existingBalance)
            await dao.create({
                credit: _credit,
                debit: _debit,
                balance: _credit - _debit,
                shipOwnerId: shipOwnerId,
                boxesTypeId: boxesType.id
            });
        else {
            existingBalance.credit = _credit;
            existingBalance.debit = _debit;
            existingBalance.balance = _credit - _debit;
            await dao.update(existingBalance);
        }
    }
}

router.getReportData = async function (options) {
    let criteria = {where: {}};
    // console.log("=====================>options : " + JSON.stringify(options));
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
    if (!tools.isFalsey(options.merchant)) {
        criteria.where.merchantId = options.merchant;
        criteria.where.shipOwnerId = null;
    } else if (!tools.isFalsey(options.producer)) {
        if (options.isMerchantProducer) {
            criteria.where.merchantId = options.producer;
            criteria.where.shipOwnerId = null;
        } else {
            criteria.where.shipOwnerId = options.producer;
            criteria.where.merchantId = null;
        }
    } else {
        if (options.merchantReport) {
            criteria.where.shipOwnerId = null;
            criteria.where.merchantId = {'!=': null};
        } else if (options.producerReport) {
            criteria.where.merchantId = null;
            criteria.where.shipOwnerId = {'!=': null};
        }
    }


    let boxesTransactions = await boxesTransactionDao.findAll(criteria);
    // const shipownerTransactions = balanceSh.filter(tx => tx.shipOwnerId !== null);
    // const merchantTransactions = balanceSh.filter(tx => tx.merchantId !== null);

    return {boxesTransactions};

}
router.post('/generateReportShipOwner', async (req, res) => {
    try {
        const {boxesTransactions} = await router.getReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelShipOwnerReport(boxesTransactions, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFShipOwnerReport(boxesTransactions, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: boxesTransactions
            });
        }
    } catch (error) {
        console.error('Error generating Caisse report:', error);
        res.status(500).json({error: 'Error generating report'});
    }
});

router.generateReportTitleShipOwner = async function (filter, username) {
    const {producer, startDate, endDate, dateRule} = filter;
    let title = 'État de Caisse des Armateurs';
    let period = '';
    let producerName = '';

    if (producer) {
        const producerData = await Shipowner.findByPk(producer);
        if (producerData) {
            title = `État de Caisse d'Armateur : ${producerData.name.toUpperCase()}`;
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
router.generatePDFShipOwnerReport = async function (data, filter, res, username) {
    const {title, period, generationDate} = await router.generateReportTitleShipOwner(filter, username);

    const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
    let titleRow = [];
    const firstTitleRow = [], secondTitleRow = [], rowsWidth = [];
    if (!filter.producer) {
        firstTitleRow.push({
            text: 'Armateur',
            fontSize: 10,
            alignment: 'center',
            rowSpan: 2,
            bold: true,
            fillColor: '#E8EDF0'
        });
        secondTitleRow.push({text: ''});
        rowsWidth.push(120);
    }
    firstTitleRow.push({text: 'Date', rowSpan: 2, fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'});
    secondTitleRow.push({text: ''});
    rowsWidth.push(70);
    firstTitleRow.push({
        text: 'Caisses  vendues',
        colSpan: boxesTypes.length,
        fontSize: 10,
        alignment: 'center',
        bold: true,
        fillColor: '#E8EDF0'
    });
    for (let i = 0; i < boxesTypes.length - 1; i++) {
        firstTitleRow.push({text: ''});
    }
    firstTitleRow.push({
        text: 'Caisses récupérées',
        colSpan: boxesTypes.length,
        fontSize: 10,
        alignment: 'center',
        bold: true,
        fillColor: '#E8EDF0'
    });
    for (let i = 0; i < boxesTypes.length - 1; i++) {
        firstTitleRow.push({text: ''});
    }
    if (filter.producer) {
        firstTitleRow.push({
            text: 'Solde',
            colSpan: boxesTypes.length,
            fontSize: 10,
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0'
        });
        for (let i = 0; i < boxesTypes.length - 1; i++) {
            firstTitleRow.push({text: ''});
        }
    }
    let k = 2;
    if (filter.producer)
        k++;
    for (let i = 0; i < k; i++) {
        for (const boxesType of boxesTypes) {
            secondTitleRow.push({
                text: boxesType.name,
                fontSize: 10,
                alignment: 'center',
                bold: true,
                fillColor: '#E8EDF0'
            });
            rowsWidth.push(50);
        }
    }
    titleRow.push(firstTitleRow.filter(Boolean));
    titleRow.push(secondTitleRow.filter(Boolean));
    let ReportData = [];
    const calculateMargin = (rowSpan, lineHeight = 2.5, fontSize = 9) => {
        if (rowSpan == 1)
            return [0, 0, 0, 0];
        const totalRowHeight = rowSpan * fontSize * lineHeight;
        const cellHeight = fontSize;
        const verticalMargin = (totalRowHeight - cellHeight) / 2;
        return [0, verticalMargin, 0, verticalMargin];
    };
    data = _.sortBy(data, function (item) {
        return item.shipOwner ? item.shipOwner.name : '';
    });
    const groupedByShipOwner = _.groupBy(data, item => item.shipOwner?.name);
    Object.keys(groupedByShipOwner).forEach(shipOwner => {
        const shipOwnerGroup = _.sortBy(groupedByShipOwner[shipOwner], 'date');
        const groupedByDate = _.groupBy(shipOwnerGroup, item => moment(item.date).format('DD-MM-YYYY'));
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const transactionsByBoxesType = _.groupBy(dateGroup, function (boxesTransaction) {
                return boxesTransaction.boxesType?.name || '';
            });
            const row = [
                !filter.producer ? {
                    text: dateGroup[0].shipOwner?.name.toUpperCase(),
                    rowSpan: shipOwnerGroup.length,
                    fontSize: 9,
                    alignment: 'center',
                    margin: calculateMargin(shipOwnerGroup.length)
                } : null,
                {
                    text: moment(dateGroup[0].date).format('DD-MM-YYYY'),
                    rowSpan: dateGroup.length,
                    fontSize: 9,
                    alignment: 'center',
                    margin: calculateMargin(dateGroup.length)
                }];
            for (const boxesType of boxesTypes) {
                let boxesTransaction = transactionsByBoxesType[boxesType.name];
                boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                boxesType.totalCreditSum = boxesType.totalCreditSum || 0;
                boxesType.totalCreditSum += boxesTransaction ? boxesTransaction.credit || 0 : 0;
                row.push({
                    text: boxesTransaction ? boxesTransaction.credit : 0,
                    fontSize: 9,
                    alignment: 'center',
                    margin: [0, 3]
                });
            }
            for (const boxesType of boxesTypes) {
                let boxesTransaction = transactionsByBoxesType[boxesType.name];
                boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                boxesType.totalDebitSum = boxesType.totalDebitSum || 0;
                boxesType.totalDebitSum += boxesTransaction ? boxesTransaction.debit || 0 : 0;
                row.push({
                    text: boxesTransaction ? boxesTransaction.debit : 0,
                    fontSize: 9,
                    alignment: 'center',
                    margin: [0, 3]
                });
            }
            if (filter.producer)
                for (const boxesType of boxesTypes) {
                    let boxesTransaction = transactionsByBoxesType[boxesType.name];
                    boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                    row.push({
                        text: boxesTransaction ? boxesTransaction.balance : 0,
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    });
                }
            ReportData.push(row.filter(Boolean));
        });
    });
    const totalRow = [{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true, colSpan: filter.producer ? 1 : 2, margin: [0, 3]
    }];
    if (!filter.producer)
        totalRow.push({text: ''});
    for (const boxesType of boxesTypes) {
        totalRow.push({text: boxesType.totalCreditSum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]});
    }
    for (const boxesType of boxesTypes) {
        totalRow.push({text: boxesType.totalDebitSum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]});
    }
    if (filter.producer)
        for (const boxesType of boxesTypes) {
            totalRow.push({
                text: boxesType.totalCreditSum || 0 - boxesType.totalDebitSum || 0,
                fontSize: 8,
                alignment: 'center',
                bold: true,
                margin: [0, 3]
            });
        }
    ReportData.push(totalRow.filter(Boolean));
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
                margin: [0, 20, 0, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            {text: generationDate, fontSize: 10, alignment: 'right'},
            '\n',

            {
                columns: [{
                    table: {
                        headerRows: 2,
                        body: [...titleRow, ...ReportData],
                        widths: rowsWidth.filter(Boolean),

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

    fileName = "etatBoxes.pdf";
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
router.generateExcelShipOwnerReport = async function (data, filter, res, username) {
    try {
        const {title, period, generationDate} = await router.generateReportTitleShipOwner(filter, username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
        let tableColumnsCount = boxesTypes.length * 3 + 1;
        let tableWidth = boxesTypes.length * 3 * 10 + 20;
        if (!filter.producer) {
            tableWidth = tableWidth + 30 - boxesTypes.length * 10;
            tableColumnsCount = tableColumnsCount + 1 - boxesTypes.length;
        }
        ws.cell(1, 1, 1, tableColumnsCount, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, tableColumnsCount, true)
            .string(title)
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, tableColumnsCount, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(40);

        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        let rowIndex = 5, colIndex = 1;
        const columnWidth = Math.floor((tableWidth - 20 - (!filter.producer ? 30 : 0)) / tableColumnsCount);
        if (!filter.producer) {
            ws.cell(rowIndex, colIndex, rowIndex + 1, colIndex, true).string('Armateur').style(headerStyle);
            ws.column(colIndex).setWidth(30);
            colIndex++;
        }
        ws.cell(rowIndex, colIndex, rowIndex + 1, colIndex, true).string('Date').style(headerStyle);
        ws.column(colIndex).setWidth(20);
        colIndex++;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses vendues').style(headerStyle);
        ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses récupérées').style(headerStyle);
        ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        colIndex += boxesTypes.length;
        if (filter.producer) {
            ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Balance').style(headerStyle);
            ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        }
        rowIndex++;
        colIndex = 1;
        colIndex++;
        let j = 2;
        if (!filter.producer)
            colIndex++;
        else
            j++;
        for (let i = 0; i < j; i++) {
            boxesTypes.forEach((boxesType, index) => {
                ws.cell(rowIndex, colIndex).string(boxesType.name).style(headerStyle);
                ws.column(colIndex).setWidth(columnWidth);
                colIndex++;
            });
        }
        rowIndex++;
        colIndex = 1;
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
        data = _.sortBy(data, function (item) {
            return item.shipOwner ? item.shipOwner.name : '';
        });
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};

        const groupedByShipOwner = _.groupBy(data, item => item.shipOwner?.name);
        Object.keys(groupedByShipOwner).forEach(shipOwner => {
            let isFirstShipOwnerRow = true;
            const shipOwnerGroup = _.sortBy(groupedByShipOwner[shipOwner], 'date');
            const groupedByDate = _.groupBy(shipOwnerGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
                const transactionsByBoxesType = _.groupBy(dateGroup, function (boxesTransaction) {
                    return boxesTransaction.boxesType?.name || '';
                });
                colIndex = 1;
                if (!filter.producer) {
                    if (isFirstShipOwnerRow) {
                        ws.cell(rowIndex, colIndex, rowIndex + shipOwnerGroup.length - 1, colIndex, true).string(dateGroup[0].shipOwner?.name.toUpperCase()).style(rowStyle);
                        colIndex++;
                        isFirstShipOwnerRow = false;
                    } else
                        colIndex++;
                }
                ws.cell(rowIndex, colIndex).date(dateGroup[0].date).style(dateFormatStyle).style(rowStyle);
                colIndex++;
                for (const boxesType of boxesTypes) {
                    let boxesTransaction = transactionsByBoxesType[boxesType.name];
                    boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                    boxesType.totalCreditSum = boxesType.totalCreditSum || 0;
                    boxesType.totalDebitSum = boxesType.totalDebitSum || 0;
                    boxesType.totalCreditSum += boxesTransaction ? boxesTransaction.credit || 0 : 0;
                    boxesType.totalDebitSum += boxesTransaction ? boxesTransaction.debit || 0 : 0;
                    ws.cell(rowIndex, colIndex).number(boxesTransaction ? boxesTransaction.credit : 0).style(integerFormat).style(rowStyle);
                    ws.cell(rowIndex, colIndex + boxesTypes.length).number(boxesTransaction ? boxesTransaction.debit : 0).style(integerFormat).style(rowStyle);
                    if (filter.producer)
                        ws.cell(rowIndex, colIndex + boxesTypes.length * 2).number(boxesTransaction ? boxesTransaction.balance : 0).style(integerFormat).style(rowStyle);
                    colIndex++;
                }
                rowIndex++;
            });
        });

        colIndex = 1;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + (filter.producer ? 0 : 1), true).string('Total').style(totalStyle);
        colIndex++;
        if (!filter.producer)
            colIndex++;
        for (const boxesType of boxesTypes) {
            ws.cell(rowIndex, colIndex).number(boxesType.totalCreditSum || 0).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, colIndex + boxesTypes.length).number(boxesType.totalDebitSum || 0).style(integerFormat).style(totalStyle);
            if (filter.producer)
                ws.cell(rowIndex, colIndex + boxesTypes.length * 2).number(boxesType.totalCreditSum || 0 - boxesType.totalDebitSum || 0).style(integerFormat).style(totalStyle);
            colIndex++;
        }
        const fileName = "etat des caisses.xlsx";
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

router.post('/generateReportMerchant', async (req, res) => {
    try {
        const {boxesTransactions} = await router.getReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelMerchantReport(boxesTransactions, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFMerchantReport(boxesTransactions, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: boxesTransactions
            });
        }
    } catch (error) {
        console.error('Error generating Caisse report:', error);
        res.status(500).json({error: 'Error generating report'});
    }
});

router.generateReportTitleMerchant = async function (filter, username) {
    const {merchant, startDate, endDate, dateRule} = filter;
    let title = 'État de Caisse des commerçants';
    let period = '';
    let merchantName = '';

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `État de Caisse du commerçant : ${merchantData.name.toUpperCase()}`;
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

    // reportTitle.push(title);
    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, period, generationDate,
    };
}
router.generatePDFMerchantReport = async function (data, filter, res, username) {
    const {title, period, generationDate} = await router.generateReportTitleMerchant(filter, username);
    const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
    let titleRow = [];
    const firstTitleRow = [], secondTitleRow = [], rowsWidth = [];
    if (!filter.merchant) {
        firstTitleRow.push({
            text: 'Commerçant',
            fontSize: 10,
            alignment: 'center',
            rowSpan: 2,
            bold: true,
            fillColor: '#E8EDF0'
        });
        secondTitleRow.push({text: ''});
        rowsWidth.push(120);
    }
    firstTitleRow.push({text: 'Date', rowSpan: 2, fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'});
    secondTitleRow.push({text: ''});
    rowsWidth.push(70);
    firstTitleRow.push({
        text: 'Caisses achetés',
        colSpan: boxesTypes.length,
        fontSize: 10,
        alignment: 'center',
        bold: true,
        fillColor: '#E8EDF0'
    });
    for (let i = 0; i < boxesTypes.length - 1; i++) {
        firstTitleRow.push({text: ''});
    }
    firstTitleRow.push({
        text: 'Caisses remises',
        colSpan: boxesTypes.length,
        fontSize: 10,
        alignment: 'center',
        bold: true,
        fillColor: '#E8EDF0'
    });
    for (let i = 0; i < boxesTypes.length - 1; i++) {
        firstTitleRow.push({text: ''});
    }
    firstTitleRow.push({
        text: 'Caisses vendues',
        colSpan: boxesTypes.length,
        fontSize: 10,
        alignment: 'center',
        bold: true,
        fillColor: '#E8EDF0'
    });
    for (let i = 0; i < boxesTypes.length - 1; i++) {
        firstTitleRow.push({text: ''});
    }
    if (filter.merchant) {
        firstTitleRow.push({
            text: 'Solde',
            colSpan: boxesTypes.length,
            fontSize: 10,
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0'
        });
        for (let i = 0; i < boxesTypes.length - 1; i++) {
            firstTitleRow.push({text: ''});
        }
    }
    let k = 3;
    if (filter.merchant)
        k++;
    for (let i = 0; i < k; i++) {
        for (const boxesType of boxesTypes) {
            secondTitleRow.push({
                text: boxesType.name,
                fontSize: 10,
                alignment: 'center',
                bold: true,
                fillColor: '#E8EDF0'
            });
            rowsWidth.push(35);
        }
    }
    titleRow.push(firstTitleRow.filter(Boolean));
    titleRow.push(secondTitleRow.filter(Boolean));
    let ReportData = [];
    const calculateMargin = (rowSpan, lineHeight = 2.5, fontSize = 9) => {
        if (rowSpan == 1)
            return [0, 0, 0, 0];
        const totalRowHeight = rowSpan * fontSize * lineHeight;
        const cellHeight = fontSize;
        const verticalMargin = (totalRowHeight - cellHeight) / 2;
        return [0, verticalMargin, 0, verticalMargin];
    };
    data = _.sortBy(data, function (item) {
        return item.merchant ? item.merchant.name : '';
    });
    const groupedByMerchant = _.groupBy(data, item => item.merchant?.name);
    Object.keys(groupedByMerchant).forEach(merchant => {
        const merchantGroup = _.sortBy(groupedByMerchant[merchant], 'date');
        const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const transactionsByBoxesType = _.groupBy(dateGroup, function (boxesTransaction) {
                return boxesTransaction.boxesType?.name || '';
            });
            const row = [
                !filter.merchant ? {
                    text: dateGroup[0].merchant?.name.toUpperCase(),
                    rowSpan: merchantGroup.length,
                    fontSize: 9,
                    alignment: 'center',
                    margin: calculateMargin(merchantGroup.length)
                } : null,
                {
                    text: moment(dateGroup[0].date).format('DD-MM-YYYY'),
                    rowSpan: dateGroup.length,
                    fontSize: 9,
                    alignment: 'center',
                    margin: calculateMargin(dateGroup.length)
                }];
            for (const boxesType of boxesTypes) {
                let boxesTransaction = transactionsByBoxesType[boxesType.name];
                boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                boxesType.totalDebitSum = boxesType.totalDebitSum || 0;
                boxesType.totalDebitSum += boxesTransaction ? boxesTransaction.debit || 0 : 0;
                row.push({
                    text: boxesTransaction ? boxesTransaction.debit : 0,
                    fontSize: 9,
                    alignment: 'center',
                    margin: [0, 3]
                });
            }
            for (const boxesType of boxesTypes) {
                let boxesTransaction = transactionsByBoxesType[boxesType.name];
                boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                boxesType.totalCreditSum = boxesType.totalCreditSum || 0;
                boxesType.totalCreditSum += boxesTransaction ? boxesTransaction.credit || 0 : 0;
                row.push({
                    text: boxesTransaction ? boxesTransaction.credit : 0,
                    fontSize: 9,
                    alignment: 'center',
                    margin: [0, 3]
                });
            }
            for (const boxesType of boxesTypes) {
                let boxesTransaction = transactionsByBoxesType[boxesType.name];
                boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                boxesType.totalMerchantSalesCredit = boxesType.totalMerchantSalesCredit || 0;
                boxesType.totalMerchantSalesCredit += boxesTransaction ? boxesTransaction.totalMerchantSalesCredit || 0 : 0;
                row.push({
                    text: boxesTransaction ? boxesTransaction.totalMerchantSalesCredit : 0,
                    fontSize: 9,
                    alignment: 'center',
                    margin: [0, 3]
                });
            }
            if (filter.merchant)
                for (const boxesType of boxesTypes) {
                    let boxesTransaction = transactionsByBoxesType[boxesType.name];
                    boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                    row.push({
                        text: boxesTransaction ? boxesTransaction.balance : 0,
                        fontSize: 9,
                        alignment: 'center',
                        margin: [0, 3]
                    });
                }
            ReportData.push(row.filter(Boolean));
        });
    });
    const totalRow = [{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true, colSpan: filter.merchant ? 1 : 2, margin: [0, 3]
    }];
    if (!filter.merchant)
        totalRow.push({text: ''});
    for (const boxesType of boxesTypes) {
        totalRow.push({text: boxesType.totalDebitSum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]});
    }
    for (const boxesType of boxesTypes) {
        totalRow.push({text: boxesType.totalCreditSum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]});
    }
    for (const boxesType of boxesTypes) {
        totalRow.push({
            text: boxesType.totalMerchantSalesCredit,
            fontSize: 8,
            alignment: 'center',
            bold: true,
            margin: [0, 3]
        });
    }
    if (filter.merchant)
        for (const boxesType of boxesTypes) {
            totalRow.push({
                text: (boxesType.totalCreditSum || 0) + (boxesType.totalMerchantSalesCredit || 0) - (boxesType.totalDebitSum || 0),
                fontSize: 8,
                alignment: 'center',
                bold: true,
                margin: [0, 3]
            });
        }
    ReportData.push(totalRow.filter(Boolean));
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
                margin: [0, 20, 0, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            {text: generationDate, fontSize: 10, alignment: 'right'},
            '\n',

            {
                columns: [{
                    table: {
                        headerRows: 2,
                        body: [...titleRow, ...ReportData],
                        widths: rowsWidth.filter(Boolean),

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

    fileName = "etatBoxesMerchant.pdf";
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

router.generateExcelMerchantReport = async function (data, filter, res, username) {
    try {
        const {title, period, generationDate} = await router.generateReportTitleMerchant(filter, username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
        let tableColumnsCount = boxesTypes.length * 4 + 1;
        let tableWidth = boxesTypes.length * 4 * 10 + 20;
        if (!filter.merchant) {
            tableWidth = tableWidth + 30 - boxesTypes.length * 10;
            tableColumnsCount = tableColumnsCount + 1 - boxesTypes.length;
        }
        ws.cell(1, 1, 1, tableColumnsCount, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, tableColumnsCount, true)
            .string(title)
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, tableColumnsCount, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(40);

        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        let rowIndex = 5, colIndex = 1;
        const columnWidth = Math.floor((tableWidth - 20 - (!filter.merchant ? 30 : 0)) / tableColumnsCount);
        if (!filter.merchant) {
            ws.cell(rowIndex, colIndex, rowIndex + 1, colIndex, true).string('Commerçant').style(headerStyle);
            ws.column(colIndex).setWidth(30);
            colIndex++;
        }
        ws.cell(rowIndex, colIndex, rowIndex + 1, colIndex, true).string('Date').style(headerStyle);
        ws.column(colIndex).setWidth(20);
        colIndex++;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses achetées').style(headerStyle);
        ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses remises').style(headerStyle);
        ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses vendues').style(headerStyle);
        ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        colIndex += boxesTypes.length;
        if (filter.merchant) {
            ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Balance').style(headerStyle);
            ws.column(colIndex).setWidth(columnWidth * boxesTypes.length);
        }
        rowIndex++;
        colIndex = 1;
        colIndex++;
        let j = 3;
        if (!filter.merchant)
            colIndex++;
        else
            j++;
        for (let i = 0; i < j; i++) {
            boxesTypes.forEach((boxesType, index) => {
                ws.cell(rowIndex, colIndex).string(boxesType.name).style(headerStyle);
                ws.column(colIndex).setWidth(columnWidth);
                colIndex++;
            });
        }
        rowIndex++;
        colIndex = 1;
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
        data = _.sortBy(data, function (item) {
            return item.merchant ? item.merchant.name : '';
        });
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};

        const groupedByMerchant = _.groupBy(data, item => item.merchant?.name);
        Object.keys(groupedByMerchant).forEach(merchant => {
            let isFirstMerchantRow = true;
            const merchantGroup = _.sortBy(groupedByMerchant[merchant], 'date');
            const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
                const transactionsByBoxesType = _.groupBy(dateGroup, function (boxesTransaction) {
                    return boxesTransaction.boxesType?.name || '';
                });
                colIndex = 1;
                if (!filter.merchant) {
                    if (isFirstMerchantRow) {
                        ws.cell(rowIndex, colIndex, rowIndex + merchantGroup.length - 1, colIndex, true).string(dateGroup[0].merchant?.name.toUpperCase()).style(rowStyle);
                        colIndex++;
                        isFirstMerchantRow = false;
                    } else
                        colIndex++;
                }
                ws.cell(rowIndex, colIndex).date(dateGroup[0].date).style(dateFormatStyle).style(rowStyle);
                colIndex++;
                for (const boxesType of boxesTypes) {
                    let boxesTransaction = transactionsByBoxesType[boxesType.name];
                    boxesTransaction = (boxesTransaction && boxesTransaction.length) ? boxesTransaction[0] : null;
                    boxesType.totalCreditSum = boxesType.totalCreditSum || 0;
                    boxesType.totalDebitSum = boxesType.totalDebitSum || 0;
                    boxesType.totalMerchantSalesCredit = boxesType.totalMerchantSalesCredit || 0;
                    boxesType.totalCreditSum += boxesTransaction ? boxesTransaction.credit || 0 : 0;
                    boxesType.totalDebitSum += boxesTransaction ? boxesTransaction.debit || 0 : 0;
                    boxesType.totalMerchantSalesCredit += boxesTransaction ? boxesTransaction.totalMerchantSalesCredit || 0 : 0;
                    ws.cell(rowIndex, colIndex).number(boxesTransaction ? boxesTransaction.debit : 0).style(integerFormat).style(rowStyle);
                    ws.cell(rowIndex, colIndex + boxesTypes.length).number(boxesTransaction ? boxesTransaction.credit : 0).style(integerFormat).style(rowStyle);
                    ws.cell(rowIndex, colIndex + boxesTypes.length * 2).number(boxesTransaction ? boxesTransaction.merchantSalesCredit : 0).style(integerFormat).style(rowStyle);
                    if (filter.merchant)
                        ws.cell(rowIndex, colIndex + boxesTypes.length * 3).number(boxesTransaction ? boxesTransaction.balance : 0).style(integerFormat).style(rowStyle);
                    colIndex++;
                }
                rowIndex++;
            });
        });

        colIndex = 1;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + (filter.merchant ? 0 : 1), true).string('Total').style(totalStyle);
        colIndex++;
        if (!filter.merchant)
            colIndex++;
        for (const boxesType of boxesTypes) {
            ws.cell(rowIndex, colIndex).number(boxesType.totalDebitSum || 0).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, colIndex + boxesTypes.length).number(boxesType.totalCreditSum || 0).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, colIndex + boxesTypes.length * 2).number(boxesType.totalMerchantSalesCredit || 0).style(integerFormat).style(totalStyle);
            if (filter.merchant)
                ws.cell(rowIndex, colIndex + boxesTypes.length * 3).number((boxesType.totalCreditSum || 0) + (boxesType.totalMerchantSalesCredit || 0) - (boxesType.totalDebitSum || 0)).style(integerFormat).style(totalStyle);
            colIndex++;
        }

        const fileName = "etatBoxesMerchant.xlsx";
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

router.get('/generateSummaryReportMerchant', async (req, res) => {
    try {
        let data = await dao.find({where: {merchantId: {'!=': null}, balance: {'!=': 0}}});
        const username = req.session.username;
        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Balance de caisses');
        const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
        const tableColumnsCount = boxesTypes.length * 3 + 1;
        ws.cell(1, 1, 1, tableColumnsCount, true)
            .string(`Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, tableColumnsCount, true)
            .string("Balance de caisses des commerçants")
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(40);

        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
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
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        // const tableWidth = 100;
        const tableWidth = boxesTypes.length * 3 * 10 + 20;
        const columnWidth = Math.floor(tableWidth / tableColumnsCount);
        let rowIndex = 5, colIndex = 1;
        // const titleRow = ['Armateur', 'Type de caisses', 'Caisses vendues', 'Caisses récupérées', 'Balance'];
        ws.cell(rowIndex, colIndex, rowIndex + 1, colIndex, true).string('Commerçant').style(headerStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses achetées').style(headerStyle);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses remises').style(headerStyle);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Balance').style(headerStyle);
        rowIndex++;
        colIndex = 1;
        colIndex++;
        for (let i = 0; i < 3; i++) {
            boxesTypes.forEach((boxesType, index) => {
                ws.cell(rowIndex, colIndex).string(boxesType.name).style(headerStyle);
                ws.column(colIndex).setWidth(columnWidth);
                colIndex++;
            });
        }
        data = _.sortBy(data, function (boxesBalance) {
            return boxesBalance.merchant.name;
        });
        let groupedDataByMerchant = _.groupBy(data, function (boxesBalance) {
            return boxesBalance.merchant.name;
        });
        // groupedDataByMerchant = _.sortBy(groupedDataByMerchant, function (boxesBalanceGroupe) {
        //     return _.sumBy(boxesBalanceGroupe, function (boxesBalance) {
        //         return boxesBalance.balance;
        //     })
        // });
        colIndex = 1;
        rowIndex++;
        Object.keys(groupedDataByMerchant).forEach(shipOwner => {
            const merchantBlances = groupedDataByMerchant[shipOwner];
            const balancesByBoxType = _.groupBy(merchantBlances, function (boxesBalance) {
                return boxesBalance.boxesType?.name || '';
            });
            colIndex = 1;
            ws.cell(rowIndex, colIndex).string(merchantBlances[0].merchant?.name.toUpperCase()).style(rowStyle);
            colIndex++;
            for (const boxesType of boxesTypes) {
                let boxesBalance = balancesByBoxType[boxesType.name];
                boxesBalance = (boxesBalance && boxesBalance.length) ? boxesBalance[0] : null;
                boxesType.totalCredit = boxesType.totalCredit || 0;
                boxesType.totalDebit = boxesType.totalDebit || 0;
                boxesType.totalCredit += boxesBalance ? boxesBalance.credit : 0;
                boxesType.totalDebit += boxesBalance ? boxesBalance.debit : 0;
                ws.cell(rowIndex, colIndex).number(boxesBalance ? boxesBalance.debit : 0).style(integerFormat).style(rowStyle);
                ws.cell(rowIndex, colIndex + boxesTypes.length).number(boxesBalance ? boxesBalance.credit : 0).style(integerFormat).style(rowStyle);
                ws.cell(rowIndex, colIndex + boxesTypes.length * 2).number(boxesBalance ? boxesBalance.balance : 0).style(integerFormat).style(rowStyle);
                colIndex++;
            }
            rowIndex++;
        });
        let totalStartCol = 1;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, totalStartCol, rowIndex).string('Total').style(totalStyle);
        totalStartCol++;
        for (const boxesType of boxesTypes) {
            ws.cell(rowIndex, totalStartCol).number(boxesType.totalDebit).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, totalStartCol + boxesTypes.length).number(boxesType.totalCredit).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, totalStartCol + boxesTypes.length * 2).number(boxesType.totalCredit - boxesType.totalDebit).style(integerFormat).style(totalStyle);
            totalStartCol++;
        }
        const fileName = "balance_caisses_commercants.xlsx";
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
});

router.get('/generateSummaryReportShipOwner', async (req, res) => {
    try {
        let data = await dao.find({where: {shipOwnerId: {'!=': null}, balance: {'!=': 0}}});
        const username = req.session.username;
        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Balance de caisses');
        const boxesTypes = await BoxesType.findAll({order: [['order', 'ASC']]});
        const tableColumnsCount = boxesTypes.length * 3 + 1;
        ws.cell(1, 1, 1, tableColumnsCount, true)
            .string(`Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, tableColumnsCount, true)
            .string("Balance de caisses des armateurs")
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(40);

        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
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
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        const tableWidth = boxesTypes.length * 3 * 10 + 20;
        const columnWidth = Math.floor(tableWidth / tableColumnsCount);
        let rowIndex = 5, colIndex = 1;
        // const titleRow = ['Armateur', 'Type de caisses', 'Caisses vendues', 'Caisses récupérées', 'Balance'];
        ws.cell(rowIndex, colIndex, rowIndex + 1, colIndex, true).string('Armateur').style(headerStyle);
        colIndex++;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses vendues').style(headerStyle);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Caisses récupérées').style(headerStyle);
        colIndex += boxesTypes.length;
        ws.cell(rowIndex, colIndex, rowIndex, colIndex + boxesTypes.length - 1, true).string('Balance').style(headerStyle);
        rowIndex++;
        colIndex = 1;
        colIndex++;
        for (let i = 0; i < 3; i++) {
            boxesTypes.forEach((boxesType, index) => {
                ws.cell(rowIndex, colIndex).string(boxesType.name).style(headerStyle);
                ws.column(colIndex).setWidth(columnWidth);
                colIndex++;
            });
        }
        data = _.sortBy(data, function (boxesBalance) {
            return boxesBalance.shipOwner.name;
        });
        let groupedDataByShipOwner = _.groupBy(data, function (boxesBalance) {
            return boxesBalance.shipOwner.name;
        });
        // groupedDataByShipOwner = _.sortBy(groupedDataByShipOwner, function (boxesBalanceGroupe) {
        //     return _.sumBy(boxesBalanceGroupe, function (boxesBalance) {
        //         return -boxesBalance.balance;
        //     })
        // });
        colIndex = 1;
        rowIndex++;
        Object.keys(groupedDataByShipOwner).forEach(shipOwner => {
            const shipOwnerBlances = groupedDataByShipOwner[shipOwner];
            const balancesByBoxType = _.groupBy(shipOwnerBlances, function (boxesBalance) {
                return boxesBalance.boxesType?.name || '';
            });
            colIndex = 1;
            ws.cell(rowIndex, colIndex).string(shipOwnerBlances[0].shipOwner?.name.toUpperCase()).style(rowStyle);
            colIndex++;
            for (const boxesType of boxesTypes) {
                let boxesBalance = balancesByBoxType[boxesType.name];
                boxesBalance = (boxesBalance && boxesBalance.length) ? boxesBalance[0] : null;
                boxesType.totalCredit = boxesType.totalCredit || 0;
                boxesType.totalDebit = boxesType.totalDebit || 0;
                boxesType.totalCredit += boxesBalance ? boxesBalance.credit : 0;
                boxesType.totalDebit += boxesBalance ? boxesBalance.debit : 0;
                ws.cell(rowIndex, colIndex).number(boxesBalance ? boxesBalance.credit : 0).style(integerFormat).style(rowStyle);
                ws.cell(rowIndex, colIndex + boxesTypes.length).number(boxesBalance ? boxesBalance.debit : 0).style(integerFormat).style(rowStyle);
                ws.cell(rowIndex, colIndex + boxesTypes.length * 2).number(boxesBalance ? boxesBalance.balance : 0).style(integerFormat).style(rowStyle);
                colIndex++;
            }
            rowIndex++;
        });
        let totalStartCol = 1;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, totalStartCol, rowIndex).string('Total').style(totalStyle);
        totalStartCol++;
        for (const boxesType of boxesTypes) {
            ws.cell(rowIndex, totalStartCol).number(boxesType.totalCredit).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, totalStartCol + boxesTypes.length).number(boxesType.totalDebit).style(integerFormat).style(totalStyle);
            ws.cell(rowIndex, totalStartCol + boxesTypes.length * 2).number(boxesType.totalCredit - boxesType.totalDebit).style(integerFormat).style(totalStyle);
            totalStartCol++;
        }
        const fileName = "balance_caisses_armateurs.xlsx";
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
});


module.exports = router;

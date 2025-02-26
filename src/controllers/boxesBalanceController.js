var router = require('express').Router();
const dao = require("../dao/boxesBalanceDao");
const boxesTransactionDao =require("../dao/boxesTransactionDao");
const Response = require("../utils/response");
const {sequelize, BoxesTransaction, Merchant, Shipowner} = require("../models");
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
            [sequelize.fn('sum', sequelize.col('debit')), 'debit']
        ],
        raw: true,
        where: {merchantId: merchantId}
    });
    const _credit = (result && result.length) ? (result[0]["credit"] || 0) : 0;
    const _debit = (result && result.length) ? (result[0]["debit"] || 0) : 0;
    const _merchantSalesCredit = (result && result.length) ? (result[0]["merchantSalesCredit"] || 0) : 0;
    let balance = await dao.findOne({where: {merchantId: merchantId}});
    if (!balance)
        await dao.create({
            credit: _credit + _merchantSalesCredit,
            debit: _debit,
            balance: _credit + _merchantSalesCredit - _debit,
            merchantId: merchantId
        });
    else {
        balance.credit = _credit + _merchantSalesCredit;
        balance.debit = _debit;
        balance.balance = _credit + _merchantSalesCredit - _debit;
        await dao.update(balance);
    }
}

router.updateByShipOwner = async function (shipOwnerId) {
    let result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('credit')), 'credit'],
            [sequelize.fn('sum', sequelize.col('debit')), 'debit'],
        ],
        raw: true,
        where: {shipOwnerId: shipOwnerId}
    });
    const _credit = (result && result.length) ? (result[0]["credit"] || 0) : 0;
    const _debit = (result && result.length) ? (result[0]["debit"] || 0) : 0;
    let balance = await dao.findOne({where: {shipOwnerId: shipOwnerId}});
    if (!balance)
        await dao.create({
            credit: _credit,
            debit: _debit,
            balance: _credit - _debit,
            shipOwnerId: shipOwnerId
        });
    else {
        balance.credit = _credit;
        balance.debit = _debit;
        balance.balance = _credit - _debit;
        await dao.update(balance);
    }
}

router.getReportData = async function (options) {
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
 /*  if (!tools.isFalsey(options.merchant))
        criteria.where.merchantId = options.merchant;*/
    if (!tools.isFalsey(options.producer)) {
        criteria.where.shipOwnerId = options.producer;
    }

    let balanceSh = await boxesTransactionDao.findAll(criteria);
    const shipownerTransactions = balanceSh.filter(tx => tx.shipOwnerId !== null);
    const merchantTransactions = balanceSh.filter(tx => tx.merchantId !== null);

    return { shipownerTransactions, merchantTransactions };

}
router.post('/generateReportShipOwner', async (req, res) => {
    try {
        const {shipownerTransactions} = await router.getReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelShipOwnerReport(shipownerTransactions, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFShipOwnerReport(shipownerTransactions, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: shipownerTransactions
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
    let titleRow = [];
    titleRow.push([
        !filter.producer ? {text: 'Armateur' , fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}: null,
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Caisses récupérées', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Caisses vendues', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        filter.producer ?{text: 'Solde', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}:null
    ].filter(Boolean));

    const filteredData = data.filter(boxes => {
        if (!filter.producer) return true;

        return (!filter.producer || boxes.shipOwnerId=== filter.producer);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    let ReportData = [];
    let totalCreditSum = 0;
    let totalDebitSum = 0;

    const groupedByProducer = _.groupBy(filteredData, item => item.shipOwner?.name);
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

            dateGroup.forEach((boxes, index) => {

                totalCreditSum += boxes.credit;
                totalDebitSum += boxes.debit

                if (!boxes.shipOwner?.name) return;
                const row = [
                    !filter.producer ? (isFirstRow ? {text: boxes.shipOwner?.name.toUpperCase(), rowSpan: producerGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(producerGroup.length)} : null) : null,
                    isFirstRow ? {text: moment(boxes.date).format('DD-MM-YYYY'), rowSpan: dateGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(dateGroup.length)} : null,
                    {text: boxes.credit, fontSize: 9, alignment: 'center', margin: [0, 3]},
                    {text: boxes.debit, fontSize: 9, alignment: 'center', margin: [0, 3]},
                    filter.producer ?{text: boxes.balance, fontSize: 9, alignment: 'center', margin: [0, 3]}: null
                ].filter(Boolean);
                ReportData.push(row);
            });
        });
    });

  ReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true,colSpan: 2 -  (filter.producer ? 1 : 0) , margin: [0, 3]},
        ...(filter.producer ? [] : ['']),
        {text: totalCreditSum , fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalDebitSum , fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
      ...(!filter.producer ? [] : [''])

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
                        body: [...titleRow, ...ReportData],
                        widths: [!filter.producer ? 120 : 0, 90, 100,80, filter.producer ? 90 : 0].filter(Boolean),
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
        const titleRow = [(!filter.producer ? 'Client' : ''), 'Date', 'Caisses récupérées',  'Caisses vendues', (filter.producer ? 'Solde' : '')].filter(Boolean);

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
        const filteredData = data.filter(boxes  => {
            return (!filter.merchant || boxes.merchant?.id === filter.merchant) ;
        });
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};

        let totalCreditSum = 0;
        let totalDebitSum = 0;

        const groupedByProducer = _.groupBy(filteredData, item => item.shipOwner?.name);
        Object.keys(groupedByProducer).forEach(producer => {
            let isFirstProducerRow = true;
            const producerGroup = groupedByProducer[producer];
            const groupedByDate = _.groupBy(producerGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
                let isFirstDateRow = true;

                dateGroup.forEach((boxes, index) => {
                    totalCreditSum += boxes.credit;
                    totalDebitSum += boxes.debit
                    if (!boxes.shipOwner?.name) return;
                    if (!filter.producer) {
                        if (isFirstProducerRow) {
                            ws.cell(rowIndex, 1, rowIndex + producerGroup.length - 1, 1, true).string(boxes.shipOwner?.name.toUpperCase()).style(rowStyle);
                            ws.column(1).setWidth(20);
                            isFirstProducerRow = false;
                        }
                    }
                    if (isFirstDateRow) {
                        ws.cell(rowIndex, filter.producer ? 1 : 2, rowIndex + dateGroup.length - 1, filter.producer ? 1 : 2, true)
                            .date(boxes.date).style(dateFormatStyle)
                            .style(rowStyle);
                        ws.column(filter.producer ? 1 : 2).setWidth(8);
                        isFirstDateRow = false;
                    }

                    let colIndex = 2;
                    if (!filter.producer)
                        colIndex++;
                    ws.cell(rowIndex, colIndex).number(boxes.credit).style(rowStyle);
                    ws.column(colIndex).setWidth(20);
                    colIndex++;

                    ws.cell(rowIndex, colIndex).number(boxes.debit).style(rowStyle);
                    ws.column(colIndex).setWidth(20);

                    if (filter.producer) {
                        colIndex++;
                        ws.cell(rowIndex, colIndex).number(boxes.balance).style(rowStyle);
                        ws.column(colIndex).setWidth(15);
                    }
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
        ws.cell(rowIndex, totalEndCol).number(totalCreditSum ).style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalDebitSum ).style(totalStyle);
        totalEndCol++;

        const fileName = "etatBoxes.xlsx";
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
        const {merchantTransactions} = await router.getReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelMerchantReport(merchantTransactions, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFMerchantReport(merchantTransactions, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: merchantTransactions
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
    let titleRow = [];
    titleRow.push([
        !filter.merchant ? {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}: null,
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Caisses achetés', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Caisses remises', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Caisses vendues', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        filter.merchant ?{text: 'Solde', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}:null
    ].filter(Boolean));

    const filteredData = data.filter(boxes => {
        if (!filter.merchant) return true;

        return (!filter.merchant || boxes.merchant?.id === filter.merchant);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    let ReportData = [];
    let totalCreditSum = 0;
    let totalDebitSum = 0;
    let totalMerchantSalesCredit =0;
    const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
    Object.keys(groupedByMerchant).forEach(merchant => {
        const merchantGroup = groupedByMerchant[merchant];
        const groupedByDate = _.groupBy(merchantGroup, item =>  moment(item.date).format('DD-MM-YYYY'));
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

            dateGroup.forEach((boxes, index) => {
                totalCreditSum += boxes.credit;
                totalDebitSum += boxes.debit
                totalMerchantSalesCredit +=boxes.merchantSalesCredit;
                if (!boxes.merchant?.name) return;
                const row = [
                    !filter.merchant ? (isFirstRow ? {text: boxes.merchant?.name.toUpperCase(), rowSpan: merchantGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(merchantGroup.length)} : null) : null,
                    isFirstRow ? {text: moment(boxes.date).format('DD-MM-YYYY'), rowSpan: dateGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(dateGroup.length)} : null,
                    {text: boxes.debit, fontSize: 9, alignment: 'center', margin: [0, 3]},
                    {text: boxes.credit, fontSize: 9, alignment: 'center', margin: [0, 3]},
                    {text: boxes.merchantSalesCredit, fontSize: 9, alignment: 'center', margin: [0, 3]},
                    filter.merchant ?{text: boxes.balance, fontSize: 9, alignment: 'center', margin: [0, 3]}: null
                ].filter(Boolean);
                ReportData.push(row);
            });
        });
    });

    ReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true,colSpan: 2 -  (filter.merchant ? 1 : 0) , margin: [0, 3]},
        ...(filter.merchant ? [] : ['']),
        {text: totalDebitSum , fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalCreditSum , fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalMerchantSalesCredit, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        ...(!filter.merchant ? [] : [''])
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
                        body: [...titleRow, ...ReportData],
                        widths: [!filter.merchant ? 120 : 0, 70, 80, 90,90, filter.merchant ? 90 : 0].filter(Boolean),

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
        const titleRow = [(!filter.merchant ? 'Client' : ''), 'Date', 'Caisses achetés',  'Caisses remises','Caisses vendues' ,(filter.merchant ? 'Solde' : '')].filter(Boolean);

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


        let rowIndex = 6;
        const filteredData = data.filter(boxes   => {
            return (!filter.merchant || boxes.merchant?.id === filter.merchant) ;
        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let totalCreditSum = 0;
        let totalDebitSum = 0;
        let totalMerchantSalesCredit =0;

        const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
        Object.keys(groupedByMerchant).forEach(merchant => {
            let isFirstMerchantRow = true;
            const merchantGroup = groupedByMerchant[merchant];
            const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
                let isFirstDateRow = true;

                dateGroup.forEach((boxes, index) => {
                    totalCreditSum += boxes.credit;
                    totalDebitSum += boxes.debit
                    totalMerchantSalesCredit +=boxes.merchantSalesCredit;
                    if (!boxes.merchant?.name) return;
                    if (!filter.merchant) {
                        if (isFirstMerchantRow) {
                            ws.cell(rowIndex, 1, rowIndex + merchantGroup.length - 1, 1, true).string(boxes.merchant?.name.toUpperCase()).style(rowStyle);
                            ws.column(1).setWidth(20);
                            isFirstMerchantRow = false;
                        }
                    }
                    if (isFirstDateRow) {
                        ws.cell(rowIndex, filter.merchant ? 1 : 2, rowIndex + dateGroup.length - 1, filter.merchant ? 1 : 2, true)
                            .date(boxes.date).style(dateFormatStyle)
                            .style(rowStyle);
                        ws.column(filter.merchant ? 1 : 2).setWidth(8);
                        isFirstDateRow = false;
                    }

                    let colIndex = 2;
                    if (!filter.merchant)
                        colIndex++;
                    ws.cell(rowIndex, colIndex).number(boxes.debit).style(rowStyle);
                    ws.column(colIndex).setWidth(20);
                    colIndex++;
                    ws.cell(rowIndex, colIndex).number(boxes.credit).style(rowStyle);
                    ws.column(colIndex).setWidth(20);
                    colIndex++;
                    ws.cell(rowIndex, colIndex).number(boxes.merchantSalesCredit).style(rowStyle);
                    ws.column(colIndex).setWidth(20);

                    if (filter.merchant) {
                        colIndex++;
                        ws.cell(rowIndex, colIndex).number(boxes.balance).style(rowStyle);
                        ws.column(colIndex).setWidth(15);
                    }
                    rowIndex++;
                });
            });
        });


        let totalStartCol = 1;
        let totalEndCol = 2;
        if (filter.merchant) totalEndCol -= 1;

        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, totalStartCol, rowIndex, totalEndCol, true).string('Total').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalDebitSum ).style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalCreditSum ).style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalMerchantSalesCredit).style(totalStyle);
        totalEndCol++;



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



module.exports = router;

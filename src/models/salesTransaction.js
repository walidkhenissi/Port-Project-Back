const {DataTypes} = require('sequelize');
const {Merchant, Article, Sale, ConsumptionInfo, PaymentInfo} = require("./index");
module.exports = (sequelize) => {
    const SalesTransaction = sequelize.define('salesTransaction', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        saleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: Sale,
            referencesKey: 'id'
        },
        merchantId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: Merchant,
            referencesKey: 'id'
        },
        articleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: Article,
            referencesKey: 'id'
        },
        receiptNumber: {
            type: DataTypes.INTEGER
        },
        boxes: {
            type: DataTypes.INTEGER,
            allowNull: true,
            default: 0
        },
        grossWeight: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: true,
            default: 0
        },
        subtractedWeight: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: true,
            default: 0
        },
        netWeight: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: true,
            default: 0
        },
        unitPrice: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        totalPrice: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        quittance: {
            type: DataTypes.STRING
        },
        transactionNumber: {
            type: DataTypes.STRING,
            allowNull: false
        },
        //total amount to pay to producer
        //totalToPayToProducer=totalPrice-producerCommission
        totalToPayToProducer: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //total amount to pay by merchant
        //totalToPayByMerchant=totalPrice+merchantCommission
        totalToPayByMerchant: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //total paid by merchant
        totalMerchantPayment: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        //rest to pay by merchant
        restMerchantPayment: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        paymentInfoId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: PaymentInfo,
            referencesKey: 'id'
        },
        //Commission amount should be paid by the producer
        producerCommission: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //Commission amount should be paid by the merchant
        merchantCommission: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        }
    });
    return SalesTransaction;
};

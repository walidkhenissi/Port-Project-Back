const {DataTypes} = require('sequelize');
const {Shipowner, Merchant, Boat, ConsumptionInfo, PaymentInfo} = require("./index");
module.exports = (sequelize) => {
    const Sale = sequelize.define('sale', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        number: {
            type: DataTypes.STRING,
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        producerName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        receiptNumber: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        //boat name + boat number
        boatReference: {
            type: DataTypes.STRING,
            allowNull: true
        },
        //total sale amount
        total: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //total amount to pay to producer
        //totalToPay=total-totalProducerCommission
        totalToPay: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //rest amount not yet paid to producer
        //restToPay=totalToPay-totalPaid
        restToPay: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //total paid amount to producer
        totalPaid: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        //Commission amount should be paid by the producer
        totalProducerCommission: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        //Commission amount should be paid by the merchant
        totalMerchantCommission: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        shipOwnerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Shipowner,
            referencesKey: 'id'
        },
        merchantId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Merchant,
            referencesKey: 'id'
        },
        boatId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Boat,
            referencesKey: 'id'
        },
        paymentInfoId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: PaymentInfo,
            referencesKey: 'id'
        }
    });
    return Sale;
};

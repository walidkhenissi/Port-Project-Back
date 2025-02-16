const {DataTypes} = require('sequelize');
const {Commission, SalesTransaction} = require("./index");
module.exports = (sequelize) => {
    const CommissionValue = sequelize.define('commissionValue', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        value: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        commissionId: {
            type: DataTypes.INTEGER,
            references: Commission,
            referencesKey: 'id',
            allowNull: false
        },
        salesTransactionId: {
            type: DataTypes.INTEGER,
            references: SalesTransaction,
            referencesKey: 'id',
            allowNull: false
        },
        saleNumber: {
            type: DataTypes.STRING,
            allowNull: false
        },
        saleReceiptNumber: {
            type: DataTypes.INTEGER
        },
        sateTransactionQuittance: {
            type: DataTypes.STRING
        },
    });
    return CommissionValue;
};

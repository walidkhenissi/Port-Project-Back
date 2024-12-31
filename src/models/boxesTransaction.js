const {DataTypes} = require('sequelize');
const {Shipowner, Merchant} = require("./index");
module.exports = (sequelize) => {
    const BoxesTransaction = sequelize.define('boxesTransaction', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        credit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        debit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        merchantSalesCredit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        balance: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        stock: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: true
        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        isCommissionaryTransaction: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            default: 0
        },
        merchantId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Merchant,
            referencesKey: 'id'
        },
        shipOwnerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Shipowner,
            referencesKey: 'id'
        }
    });
    return BoxesTransaction;
};

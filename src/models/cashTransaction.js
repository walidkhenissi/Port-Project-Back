const {DataTypes} = require('sequelize');
const {CashAccount, Payment, User, Shipowner, Merchant} = require("./index");

module.exports = (sequelize) => {
    const CashTransaction = sequelize.define('cashTransaction', {
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
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        credit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        debit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        balance: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        accountId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: CashAccount,
            referencesKey: 'id'
        },
        paymentId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Payment,
            referencesKey: 'id'
        },
        isCommissionnary: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            default: false
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
        // createUserId: {
        //     type: DataTypes.INTEGER,
        //     allowNull: true,
        //     references: User,
        //     referencesKey: 'id'
        // },
        // updateUserId: {
        //     type: DataTypes.INTEGER,
        //     allowNull: true,
        //     references: User,
        //     referencesKey: 'id'
        // },
        note: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    });
    return CashTransaction;
};

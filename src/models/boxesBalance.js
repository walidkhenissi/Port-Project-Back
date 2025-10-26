const {DataTypes} = require('sequelize');
const {Shipowner, Merchant, BoxesType} = require("./index");
module.exports = (sequelize) => {
    const BoxesBalance = sequelize.define('boxesBalance', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
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
        balance: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        boxesTypeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: BoxesType,
            referencesKey: 'id'
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
    return BoxesBalance;
};

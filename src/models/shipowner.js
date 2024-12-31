const {DataTypes} = require('sequelize');
const AddressModel = require('./address');
const CivilityModel = require('./civility');

module.exports = (sequelize) => {
    const Address = AddressModel(sequelize);
    const Civility = CivilityModel(sequelize);
    const Shipowner = sequelize.define('Shipowner', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        firstName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        lastName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        civilityId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        addressId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        socialReason: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        taxRegistrationNumber: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        phoneNumber: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
        },
    });

    Shipowner.belongsTo(Address, {foreignKey: 'addressId', targetKey: 'id', as: 'address'});
    Shipowner.belongsTo(Civility, {foreignKey: 'civilityId', targetKey: 'id', as: 'civility'});

    return Shipowner;
};


const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Address = sequelize.define('Address', {
        street: {
            type: DataTypes.STRING,
        },
        city: {
            type: DataTypes.STRING,
        },
        postalCode: {
            type: DataTypes.STRING,
        },
    }, {
        charset: 'utf8',
        collate: 'utf8_general_ci'
    });
    return Address;
};

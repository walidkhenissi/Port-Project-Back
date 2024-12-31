const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Civility = sequelize.define('Civility', {
        name: {
            type: DataTypes.STRING,
        }
    });
    return Civility;
};

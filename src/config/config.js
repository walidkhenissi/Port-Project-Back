module.exports = {
    development: {
        username: 'root', // Your MySQL username
        password: 'root', // Your MySQL password
        database: 'port_application', // Your MySQL database name
        host: '127.0.0.1',
        dialect: 'mysql'
    },
    production: {
        username: 'sps', // Your MySQL username
        password: 'sps@29092024', // Your MySQL password
        database: 'SPS', // Your MySQL database name
        host: '127.0.0.1',
        dialect: 'mysql'
    },
    pre_production: {
        username: 'preprod_sps', // Your MySQL username
        password: 'sps@29092024', // Your MySQL password
        database: 'preprod_sps', // Your MySQL database name
        host: '127.0.0.1',
        dialect: 'mysql'
    }
    // Add similar configurations for 'test' and 'production' environments if needed
};

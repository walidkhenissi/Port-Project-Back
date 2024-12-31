const {Sequelize} = require('sequelize');
const MerchantModel = require('./merchant.js');
const AddressModel = require('./address.js');
const UserModel = require('./user.js');
const ShipownerModel = require('./shipowner.js');
const BoatActivityTypeModel = require('./boat.activity.type.js');
const BoatModel = require('./boat.js');
const CivilityModel = require('./civility.js');
const CommissionModel = require('./commission.js');
const CommissionHistoryModel = require('./commissionHistory.js');
const BeneficiaryModel = require('./beneficiary.js');
const CommissionBeneficiaryModel = require('./commissionBeneficiary.js');
const ArticleModel = require('./article.js');
const SaleModel = require('./sale.js');
const SalesTransactionModel = require('./salesTransaction.js');
const BalanceModel = require('./balance.js');
const CommissionValueModel = require('./commissionValue.js');
const BeneficiaryBalanceModel = require('./beneficiaryBalance.js');
const BoxesBalanceModel = require('./boxesBalance.js');
const BoxesTransactionModel = require('./boxesTransaction.js');
const PaymentTypeModel = require('./paymentType.js');
const PaymentModel = require('./payment.js');
const BankModel = require('./bank.js');
const ConsumptionInfoModel = require('./consumptionInfo.js');
const PaymentInfoModel = require('./paymentInfo.js');
const CashAccountModel = require('./cashAccount.js');
const CashTransactionModel = require('./cashTransaction.js');
const SalesTransactionPaymentModel = require('./salesTransaction_Payment.js');
const SalePaymentModel = require('./sale_Payment.js');
const sequelize = new Sequelize({
    ...require('../config/config.js')['development'],
    define: {
        charset: 'utf8',
        collate: 'utf8_general_ci',
        // timestamps: false
    }
});

const Merchant = MerchantModel(sequelize);
const Address = AddressModel(sequelize);
const User = UserModel(sequelize);
const Shipowner = ShipownerModel(sequelize);
const BoatActivityType = BoatActivityTypeModel(sequelize);
const Boat = BoatModel(sequelize);
const Civility = CivilityModel(sequelize);
const Commission = CommissionModel(sequelize);
const CommissionHistory = CommissionHistoryModel(sequelize);
const CommissionBeneficiary = CommissionBeneficiaryModel(sequelize);
const Beneficiary = BeneficiaryModel(sequelize);
const Article = ArticleModel(sequelize);
const Sale = SaleModel(sequelize);
const SalesTransaction = SalesTransactionModel(sequelize);
const Balance = BalanceModel(sequelize);
const CommissionValue = CommissionValueModel(sequelize);
const BeneficiaryBalance = BeneficiaryBalanceModel(sequelize);
const BoxesBalance = BoxesBalanceModel(sequelize);
const BoxesTransaction = BoxesTransactionModel(sequelize);
const PaymentType = PaymentTypeModel(sequelize);
const Payment = PaymentModel(sequelize);
const Bank = BankModel(sequelize);
const ConsumptionInfo = ConsumptionInfoModel(sequelize);
const PaymentInfo = PaymentInfoModel(sequelize);
const CashAccount = CashAccountModel(sequelize);
const CashTransaction = CashTransactionModel(sequelize);
const SalesTransactionPayment = SalesTransactionPaymentModel(sequelize);
const SalePayment = SalePaymentModel(sequelize);

//Define model associations
Commission.hasMany(CommissionHistory, {foreignKey: 'commissionId', sourceKey: 'id', as: 'CommissionHistories'});
CommissionHistory.belongsTo(Commission, {foreignKey: 'commissionId', targetKey: 'id', as: 'Commission'});

Commission.hasMany(CommissionBeneficiary, {foreignKey: 'commissionId', sourceKey: 'id', as: 'CommissionBeneficiaries'});
CommissionBeneficiary.belongsTo(Commission, {foreignKey: 'commissionId', targetKey: 'id', as: 'Commission'});
Beneficiary.hasMany(CommissionBeneficiary, {
    foreignKey: 'beneficiaryId',
    sourceKey: 'id',
    as: 'CommissionBeneficiaries'
});
CommissionBeneficiary.belongsTo(Beneficiary, {foreignKey: 'beneficiaryId', targetKey: 'id', as: 'Beneficiary'});

Commission.belongsToMany(Beneficiary, {as: 'beneficiaries', through: CommissionBeneficiary, foreignKey: 'commissionId'})
Beneficiary.belongsToMany(Commission, {as: 'commissions', through: CommissionBeneficiary, foreignKey: 'beneficiaryId'})

Shipowner.hasMany(Boat, {foreignKey: 'shipOwnerId', sourceKey: 'id', as: 'boats'});
Boat.belongsTo(Shipowner, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'shipowner'});

Shipowner.hasMany(Sale, {foreignKey: 'shipOwnerId', sourceKey: 'id', as: 'sales'});
Sale.belongsTo(Shipowner, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'shipOwner'});
Merchant.hasMany(Sale, {foreignKey: 'merchantId', sourceKey: 'id', as: 'sales'});
Sale.belongsTo(Merchant, {foreignKey: 'merchantId', targetKey: 'id', as: 'merchant'});
Boat.hasMany(Sale, {foreignKey: 'boatId', sourceKey: 'id', as: 'sales'});
Sale.belongsTo(Boat, {foreignKey: 'boatId', targetKey: 'id', as: 'boat'});
PaymentInfo.hasMany(Sale, {foreignKey: 'paymentInfoId', sourceKey: 'id', as: 'sales'});
Sale.belongsTo(PaymentInfo, {foreignKey: 'paymentInfoId', targetKey: 'id', as: 'paymentInfo'});

Sale.hasMany(SalesTransaction, {foreignKey: 'saleId', sourceKey: 'id', as: 'saleTransactions'});
SalesTransaction.belongsTo(Sale, {foreignKey: 'saleId', targetKey: 'id', as: 'sale'});
Merchant.hasMany(SalesTransaction, {foreignKey: 'merchantId', sourceKey: 'id', as: 'saleTransactions'});
SalesTransaction.belongsTo(Merchant, {foreignKey: 'merchantId', targetKey: 'id', as: 'merchant'});
Article.hasMany(SalesTransaction, {foreignKey: 'articleId', sourceKey: 'id', as: 'saleTransactions'});
SalesTransaction.belongsTo(Article, {foreignKey: 'articleId', targetKey: 'id', as: 'article'});
PaymentInfo.hasMany(SalesTransaction, {foreignKey: 'paymentInfoId', sourceKey: 'id', as: 'saleTransactions'});
SalesTransaction.belongsTo(PaymentInfo, {foreignKey: 'paymentInfoId', targetKey: 'id', as: 'paymentInfo'});

Merchant.hasOne(Balance, {foreignKey: 'merchantId', targetKey: 'id', as: 'balance'});
Balance.belongsTo(Merchant, {foreignKey: 'merchantId', targetKey: 'id', as: 'merchant'});
Shipowner.hasOne(Balance, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'balance'});
Balance.belongsTo(Shipowner, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'shipOwner'});

CommissionValue.belongsTo(SalesTransaction, {
    foreignKey: 'salesTransactionId',
    targetKey: 'id',
    as: 'salesTransaction'
});
CommissionValue.belongsTo(Commission, {foreignKey: 'commissionId', targetKey: 'id', as: 'commission'});

Commission.belongsToMany(SalesTransaction, {
    as: 'salesTransactions',
    through: CommissionValue,
    foreignKey: 'commissionId'
})
SalesTransaction.belongsToMany(Commission, {
    as: 'commissions',
    through: CommissionValue,
    foreignKey: 'salesTransactionId'
})

Beneficiary.hasOne(BeneficiaryBalance, {foreignKey: 'beneficiaryId', targetKey: 'id', as: 'beneficiaryBalance'});
BeneficiaryBalance.belongsTo(Beneficiary, {foreignKey: 'beneficiaryId', targetKey: 'id', as: 'beneficiary'});

Merchant.hasOne(BoxesBalance, {foreignKey: 'merchantId', targetKey: 'id', as: 'boxesBalance'});
BoxesBalance.belongsTo(Merchant, {foreignKey: 'merchantId', targetKey: 'id', as: 'merchant'});
Shipowner.hasOne(BoxesBalance, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'boxesBalance'});
BoxesBalance.belongsTo(Shipowner, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'shipOwner'});

Merchant.hasOne(BoxesTransaction, {foreignKey: 'merchantId', targetKey: 'id', as: 'boxesTransaction'});
BoxesTransaction.belongsTo(Merchant, {foreignKey: 'merchantId', targetKey: 'id', as: 'merchant'});
Shipowner.hasOne(BoxesTransaction, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'boxesTransaction'});
BoxesTransaction.belongsTo(Shipowner, {foreignKey: 'shipOwnerId', targetKey: 'id', as: 'shipOwner'});


PaymentType.hasMany(Payment, {foreignKey: 'paymentTypeId', sourceKey: 'id', as: 'payments'});
Payment.belongsTo(PaymentType, {foreignKey: 'paymentTypeId', targetKey: 'id', as: 'paymentType'});
Bank.hasMany(Payment, {foreignKey: 'bankId', sourceKey: 'id', as: 'payments'});
Payment.belongsTo(Bank, {foreignKey: 'bankId', targetKey: 'id', as: 'bank'});
ConsumptionInfo.hasMany(Payment, {foreignKey: 'consumptionInfoId', sourceKey: 'id', as: 'consumptionInfos'});
Payment.belongsTo(ConsumptionInfo, {foreignKey: 'consumptionInfoId', targetKey: 'id', as: 'consumptionInfo'});
Merchant.hasMany(Payment, {foreignKey: 'merchantId', sourceKey: 'id', as: 'payments'});
Payment.belongsTo(Merchant, {foreignKey: 'merchantId', targetKey: 'id', as: 'merchant'});

CashAccount.hasOne(CashAccount, {foreignKey: 'parentId', targetKey: 'id', as: 'child'});
CashAccount.belongsTo(CashAccount, {foreignKey: 'parentId', targetKey: 'id', as: 'parent'});

SalesTransactionPayment.belongsTo(PaymentType, {foreignKey: 'paymentTypeId', targetKey: 'id', as: 'paymentType'});
PaymentType.hasMany(SalesTransactionPayment, {
    foreignKey: 'paymentTypeId',
    sourceKey: 'id',
    as: 'salesTransactionPayments'
});
SalesTransactionPayment.belongsTo(Payment, {foreignKey: 'paymentId', targetKey: 'id', as: 'payment'});
Payment.hasMany(SalesTransactionPayment, {foreignKey: 'paymentId', sourceKey: 'id', as: 'salesTransactionPayments'});
SalesTransactionPayment.belongsTo(SalesTransaction, {
    foreignKey: 'salesTransactionId',
    targetKey: 'id',
    as: 'salesTransaction'
});
SalesTransaction.hasMany(SalesTransactionPayment, {
    foreignKey: 'salesTransactionId',
    sourceKey: 'id',
    as: 'salesTransactionPayments'
});
SalePayment.belongsTo(Payment, {foreignKey: 'paymentId', targetKey: 'id', as: 'payment'});
Payment.hasMany(SalePayment, {foreignKey: 'paymentId', sourceKey: 'id', as: 'salePayments'});
SalePayment.belongsTo(Sale, {foreignKey: 'saleId', targetKey: 'id', as: 'sale'});
Sale.hasMany(SalePayment, {foreignKey: 'saleId', sourceKey: 'id', as: 'salePayments'});
SalePayment.belongsTo(PaymentType, {foreignKey: 'paymentTypeId', targetKey: 'id', as: 'paymentType'});
PaymentType.hasMany(SalePayment, {foreignKey: 'paymentTypeId', sourceKey: 'id', as: 'salePayments'});


module.exports = {
    sequelize,
    Merchant,
    Address,
    User,
    Shipowner,
    BoatActivityType,
    Boat,
    Civility,
    Commission,
    CommissionHistory,
    CommissionBeneficiary,
    Beneficiary,
    Article,
    Sale,
    SalesTransaction,
    Balance,
    CommissionValue,
    BeneficiaryBalance,
    BoxesBalance,
    BoxesTransaction,
    Payment,
    PaymentType,
    Bank,
    ConsumptionInfo,
    PaymentInfo,
    CashAccount,
    CashTransaction,
    SalesTransactionPayment,
    SalePayment
};

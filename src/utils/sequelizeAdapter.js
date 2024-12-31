const {Op} = require("sequelize");
const balanceController = require("../controllers/balanceController");
module.exports = {
    checkSequelizeConstraints: function (criteria) {
        if (!criteria)
            return {};
        criteria.where = checkSequelizeOperators(criteria.where);
        criteria.sort = checkSequelizeSort(criteria.sort);
        return criteria;
    }
}

const checkSequelizeOperators = function (whereCriteria) {
    // console.log("=====================>whereCriteria : " + JSON.stringify(whereCriteria));
    if (whereCriteria)
        for (let criteria in whereCriteria) {
            let criteriaValue = whereCriteria[criteria];
            if (_.isObject(criteriaValue)) {
                if (_.isArray(criteriaValue)) {
                    whereCriteria[criteria] = criteriaValue;
                } else {
                    whereCriteria[criteria] = {};
                    for (let param in criteriaValue) {
                        let value = criteriaValue[param];
                        switch (param.toUpperCase()) {
                            case '>':
                                whereCriteria[criteria][Op.gt] = value;
                                break;
                            case '>=':
                                whereCriteria[criteria][Op.gte] = value;
                                break;
                            case '<':
                                whereCriteria[criteria][Op.lt] = value;
                                break;
                            case '<=':
                                whereCriteria[criteria][Op.lte] = value;
                                break;
                            case '=':
                                whereCriteria[criteria][Op.eq] = value;
                                break;
                            case 'BETWEEN':
                                whereCriteria[criteria][Op.between] = value;
                                break;
                            case 'NOT BETWEEN':
                                whereCriteria[criteria][Op.notBetween] = value;
                                break;
                            case '!':
                            case '!=':
                                whereCriteria[criteria][Op.ne] = value;
                                break;
                            case 'IN':
                                whereCriteria[criteria] [Op.in] = value;
                                break;
                            case 'NOT IN':
                                whereCriteria[criteria] [Op.notIn] = value;
                                break;
                            case 'LIKE':
                                whereCriteria[criteria] [Op.like] = value;
                                break;
                            case 'NOT LIKE':
                                whereCriteria[criteria] [Op.notLike] = value;
                                break;
                            case 'UNDEFINED':
                                delete whereCriteria[criteria];
                                break;
                        }
                    }
                }
            }
        }
    return whereCriteria;
}
const checkSequelizeSort = function (sortCriteria) {
    const order = [];
    if (sortCriteria)
        Object.keys(sortCriteria).forEach(e => {
            let value = sortCriteria[e];
            let sort = [];
            let x = e.toString().split('.');
            for (let attr of x) {
                sort.push(attr);
            }
            sort.push(value);
            order.push(sort);
        });
    return order;
}

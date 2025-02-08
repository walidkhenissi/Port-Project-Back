const {Op} = require("sequelize");
module.exports = {
    PDF_PATH: 'files/tempPDF/',
    Excel_PATH: 'files/tempPDF/',
    isFalsey: function (value) {
        return value === null || value === undefined || value === 'undefined' || value === '' || value === NaN;
    },
    refactorDate(date) {
        let now = new Date();
        date = moment(date);
        date.second(now.getSeconds());
        date.minute(now.getMinutes());
        date.hour(now.getHours());
        return date;
    },
    // refactorDate: function (date, hours, minutes, seconds) {
    //     var now = new Date();
    //     if (!date)
    //         return now;
    //     moment.locale('fr');
    //     date = moment(date).format('YYYY-MM-DD HH:mm:ss').substring(0, 10);
    //     return date + " " + (hours ? hours : now.getHours()) + ":" + (minutes ? minutes : now.getMinutes()) + ":" + (seconds ? seconds : now.getSeconds());
    // },
    cleanTempDirectory: async function (fs, path) {
        if (tools.isFalsey(fs))
            fs = require('fs');
        if (tools.isFalsey(path))
            path = require('path');
        fs.readdir(tools.PDF_PATH, (err, files) => {
            if (err)
                console.log(err);
            else {
                for (const fileName of files) {
                    let ext = path.extname(fileName);
                    if (ext === ".pdf" || ext === ".xls" || ext === ".xlsx") {
                        // get creation time using fs.stat() method
                        fs.stat(tools.PDF_PATH + fileName, (error, stats) => {
                            // in case of any error
                            if (error) {
                                console.log(error);
                            } else {
                                try {
                                    // else show creation time from stats object
//                                    console.log("File created at: ", stats.birthtime); // File created at:  2021-04-30T23:53:07.633Z
                                    if (moment(stats.birthtime).isBefore(new Date(), 'day'))
                                        fs.unlinkSync(tools.PDF_PATH + fileName);
                                } catch (err) {
                                    console.log("Error occured while removing file : ", fileName);
                                }
                            }
                        });
                    }
                }
            }
        });
    }

};

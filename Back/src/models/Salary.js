import mongoose from 'mongoose';

const MonthDataSchema = new mongoose.Schema({
    amount: { type: Number, default: 0 },
    appraisal: { type: Number, default: 0 } // Percentage
}, { _id: false });

const SalarySchema = new mongoose.Schema({
    year: { type: Number, required: true },
    name: { type: String, required: true },
    designation: { type: String, default: '' },

    // Month-wise data
    jan: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    feb: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    mar: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    apr: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    may: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    jun: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    jul: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    aug: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    sep: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    oct: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    nov: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) },
    dec: { type: MonthDataSchema, default: () => ({ amount: 0, appraisal: 0 }) }
}, { timestamps: true });

export default mongoose.model('Salary', SalarySchema);

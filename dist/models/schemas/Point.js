"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointSchema = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
exports.pointSchema = new mongoose_1.default.Schema({
    type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
    },
    coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
            validator: function (v) {
                return v.length === 2 &&
                    v[0] >= -180 && v[0] <= 180 && // longitude
                    v[1] >= -90 && v[1] <= 90; // latitude
            },
            message: 'Invalid coordinates. Must be [longitude, latitude] within valid ranges.',
        },
    },
}, {
    _id: false, // Prevent MongoDB from creating an _id for subdocuments
});

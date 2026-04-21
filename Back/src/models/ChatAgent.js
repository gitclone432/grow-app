import mongoose from 'mongoose';

const ChatAgentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true }
    },
    { timestamps: true }
);

export default mongoose.model('ChatAgent', ChatAgentSchema);

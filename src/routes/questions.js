import express from 'express';
import { getAllQuestions, getQuestionById, createQuestion, updateQuestion, deleteQuestion } from '../controllers/questionController.js';

const router = express.Router();

// Public routes - no authentication required
router.get('/', getAllQuestions );
router.get('/:questionId', getQuestionById);
router.post('/', createQuestion);
router.put('/:questionId', updateQuestion);
router.delete('/:questionId', deleteQuestion);

export default router;

import { getAllQuestionsService, getQuestionByIdService, createQuestionService, updateQuestionService, deleteQuestionService } from '../services/questionService.js';
import { createAppError } from "../utils/createAppError.js";

export const getAllQuestions = async (req, res) => {
    const questionsWithCount = await getAllQuestionsService();

    res.status(200).json({
        success: true,
        message: 'Questions fetched successfully',
        data: questionsWithCount,
    });
};

export const getQuestionById = async (req, res) => {
    const { questionId } = req.params;
    console.log("questionId = ", req);
    const questionWithAnswers = await getQuestionByIdService(questionId);

    res.status(200).json({
        success: true,
        message: 'Question fetched successfully',
        data: questionWithAnswers,
    });
};

// POST /api/questions
export const createQuestion = async (req, res) => {
  const { title, description, tags, author } = req.body;

  if(!title || !description || !tags || !author) {
    throw createAppError("Title, description, tags, and author are required.", 400);
  }

  const populatedQuestion = await createQuestionService(
    title,
    description,
    tags,
    author
  );
  res.status(201).json({
    success: true,
    message: "Question created successfully",
    data: populatedQuestion,
  });
};

// PUT /api/questions/:id
export const updateQuestion = async (req, res) => {
  const { questionId } = req.params;
  const { title, description, tags, loggedInUser } = req.body;

  if(!title || !description || !tags || !loggedInUser) {
    throw createAppError("Title, description, tags, and loggedInUser are required.", 400);
  }

  const updatedQuestion = await updateQuestionService(
    questionId,
    title,
    description,
    tags,
    loggedInUser
  );
  res.status(200).json({
    success: true,
    message: "Question updated successfully",
    data: updatedQuestion,
  });
};

// DELETE /api/questions/:id
export const deleteQuestion = async (req, res) => {
  const { questionId } = req.params;
  const { loggedInUser } = req.body;

  if(!loggedInUser) {
    throw createAppError("LoggedInUser is required.", 400);
  }

  const deletedQuestion = await deleteQuestionService(
    questionId,
    loggedInUser
  );
  res.status(200).json({
    success: true,
    message: "Question deleted successfully",
    data: deletedQuestion,
  });
};
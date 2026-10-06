import {
  getAllQuestionsService,
  getQuestionByIdService,
  createQuestionService,
  updateQuestionService,
  deleteQuestionService,
  upvoteQuestionService,
  downvoteQuestionService,
} from '../services/questionService.js';

export const getAllQuestions = async (req, res) => {
    const questionsWithCount = await getAllQuestionsService();

    res.status(200).json({
        success: true,
        message: 'Questions fetched successfully',
        data: questionsWithCount,
    });
};

export const getQuestionById = async (req, res) => {
  const { id } = req.params;
  const questionWithAnswers = await getQuestionByIdService(id);

    res.status(200).json({
        success: true,
        message: 'Question fetched successfully',
        data: questionWithAnswers,
    });
};

// POST /api/questions
export const createQuestion = async (req, res) => {
  const { title, description, tags } = req.body;
  const author = req.user.id;

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
  const { id } = req.params;
  const { title, description, tags } = req.body;

  const updatedQuestion = await updateQuestionService(
    id,
    title,
    description,
    tags,
    req.user
  );
  res.status(200).json({
    success: true,
    message: "Question updated successfully",
    data: updatedQuestion,
  });
};

// DELETE /api/questions/:id
export const deleteQuestion = async (req, res) => {
  const { id } = req.params;

  const deletedQuestion = await deleteQuestionService(
    id,
    req.user
  );
  res.status(200).json({
    success: true,
    message: "Question deleted successfully",
    data: deletedQuestion,
  });
};

export const upvoteQuestion = async (req, res) => {
  const { id } = req.params;
  const question = await upvoteQuestionService(id, req.user.id);

  res.status(200).json({
    success: true,
    message: "Question upvoted successfully",
    data: question,
  });
};

export const downvoteQuestion = async (req, res) => {
  const { id } = req.params;
  const question = await downvoteQuestionService(id, req.user.id);

  res.status(200).json({
    success: true,
    message: "Question downvoted successfully",
    data: question,
  });
};
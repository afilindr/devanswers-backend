import Answer from '../models/Answer.js';
import { handleVote } from './voteService.js';
import { createAppError } from '../utils/createAppError.js';

const populateAuthor = (answer) =>
	answer.populate({ path: 'author', select: 'name' });

export const getAnswersByQuestionIdService = async (questionId) => {
	const answers = await Answer.find({ questionId })
		.populate({ path: 'author', select: 'name' });

	if (!answers || answers.length === 0) {
		throw createAppError('No answers found', 404);
	}

	return answers;
};

export const createAnswerService = async (questionId, answerText, author) => {
	const answer = await Answer.create({ questionId, answerText, author });
	return populateAuthor(answer);
};

export const updateAnswerService = async (answerId, answerText, loggedInUser) => {
	const answer = await Answer.findById(answerId);
	if (!answer) {
		throw createAppError('Answer not found', 404);
	}

	const isOwner = String(answer.author) === String(loggedInUser?.id);
	if (!isOwner && !loggedInUser?.isAdmin) {
		throw createAppError('Not authorized to update this answer', 403);
	}

	answer.answerText = answerText;
	await answer.save();
	return populateAuthor(answer);
};

export const deleteAnswerService = async (answerId, loggedInUser) => {
	const answer = await Answer.findById(answerId);
	if (!answer) {
		throw createAppError('Answer not found', 404);
	}

	const isOwner = String(answer.author) === String(loggedInUser?.id);
	if (!isOwner && !loggedInUser?.isAdmin) {
		throw createAppError('Not authorized to delete this answer', 403);
	}

	await Answer.deleteOne({ _id: answer._id });
	return answer;
};

export const upvoteAnswerService = async (answerId, userId) => {
	const updatedAnswer = await handleVote(Answer, answerId, userId, 'upvote');
	if (!updatedAnswer) {
		throw createAppError('Unable to upvote answer', 400);
	}

	return updatedAnswer;
};

export const downvoteAnswerService = async (answerId, userId) => {
	const updatedAnswer = await handleVote(Answer, answerId, userId, 'downvote');
	if (!updatedAnswer) {
		throw createAppError('Unable to downvote answer', 400);
	}

	return updatedAnswer;
};
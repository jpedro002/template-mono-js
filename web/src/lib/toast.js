import { toast as sonner } from 'sonner'

export const toast = {
	success: (message, options) => sonner.success(message, options),
	error: (message, options) => sonner.error(message, options),
	warning: (message, options) => sonner.warning(message, options),
	info: (message, options) => sonner.info(message, options),
	message: (message, options) => sonner(message, options),
	promise: (promise, options) => sonner.promise(promise, options),
	dismiss: (id) => sonner.dismiss(id),
}

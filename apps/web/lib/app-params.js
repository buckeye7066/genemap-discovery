const isNode = typeof window === 'undefined';

const getAppParamValue = (paramName, { defaultValue = undefined } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (searchParam) {
		return searchParam;
	}
	return defaultValue;
}

const getAppParams = () => {
	return {
		apiUrl: getAppParamValue("api_url", { 
			defaultValue: import.meta.env.VITE_API_URL || '/api'
		}),
		stripePublicKey: import.meta.env.VITE_STRIPE_PUBLIC_KEY,
		environment: import.meta.env.MODE || 'development',
	}
}

export const appParams = {
	...getAppParams()
}

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
	// jsconfig.typecheck.json sets types: [] so Vite's ImportMetaEnv is not
	// loaded; without this assertion tsc types import.meta.env as {}.
	const env = /** @type {{ VITE_API_URL?: string, VITE_STRIPE_PUBLIC_KEY?: string, MODE?: string }} */ (
		import.meta.env || {}
	);
	return {
		apiUrl: getAppParamValue("api_url", { 
			defaultValue: env.VITE_API_URL || '/api'
		}),
		stripePublicKey: env.VITE_STRIPE_PUBLIC_KEY,
		environment: env.MODE || 'development',
	}
}

export const appParams = {
	...getAppParams()
}

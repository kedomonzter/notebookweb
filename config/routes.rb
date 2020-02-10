Rails.application.routes.draw do
  root 'application#app'

    get '/.well-known/acme-challenge/:id' => 'pages#letsencrypt'

end

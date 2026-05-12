FROM quay.io/keycloak/keycloak:26.2
COPY realm-wodalytics.json /realm-template.json
COPY themes/wodalytics /opt/keycloak/themes/wodalytics
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
CMD ["start", "--import-realm"]

FROM public.ecr.aws/amazonlinux/amazonlinux:minimal AS builder
ENV NODE_OPTIONS=--max-old-space-size=16384

ADD ./ /landing-zone-accelerator-on-aws
RUN dnf update -y
RUN dnf install -y nodejs22 awscli zip
RUN npm -g install yarn
RUN cd /landing-zone-accelerator-on-aws/source \
    && yarn install && yarn build-prod \
    && rm -rf node_modules/{@esbuild,esbuild,vitest,@vitest,vite,eslint*,@typescript-eslint,lerna,@octokit/request} \
    && rm -rf node_modules/*/{@esbuild,esbuild,vitest,@vitest,vite,eslint*,@typescript-eslint,@octokit/request}

FROM public.ecr.aws/amazonlinux/amazonlinux:minimal
ENV NODE_OPTIONS=--max-old-space-size=16384
RUN dnf update -y && dnf install -y nodejs22 awscli zip && dnf clean all
RUN npm -g install yarn

# Create directory for LZA (running as root)
RUN mkdir -p /landing-zone-accelerator-on-aws

COPY --from=builder /landing-zone-accelerator-on-aws/source /landing-zone-accelerator-on-aws/source
COPY --from=builder /landing-zone-accelerator-on-aws/scripts /landing-zone-accelerator-on-aws/scripts

# Set execute permissions on scripts
RUN chmod +x /landing-zone-accelerator-on-aws/scripts/*.sh

WORKDIR /landing-zone-accelerator-on-aws
